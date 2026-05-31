require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const express = require("express");
const { keepAlive } = require("./keep_alive");
const { buildOAuthUrl, exchangeCode, getMemberInGuild, getUser } = require("./oauth");
const { getEmbedConfig, setEmbedConfig, getAllEmbeds } = require("./config");

// ─────────────────────────────────────────────
//  CLIENT DISCORD
// ─────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ─────────────────────────────────────────────
//  SERVEUR EXPRESS (OAuth2 callback + keep_alive)
// ─────────────────────────────────────────────
const app = express();
keepAlive(app);

// Map temporaire : userId -> { guildId, channelId, interactionToken, buttonCustomId }
const pendingVerifications = new Map();

// ─────────────────────────────────────────────
//  SLASH COMMANDS
// ─────────────────────────────────────────────
const commands = [
  // /config-embed : crée/modifie un embed avec boutons dans un salon
  new SlashCommandBuilder()
    .setName("config-embed")
    .setDescription("Crée ou modifie l'embed de vérification dans ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("titre").setDescription("Titre de l'embed").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("description").setDescription("Description de l'embed").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("couleur")
        .setDescription("Couleur hex (ex: #5865F2)")
        .setRequired(false)
    ),

  // /config-bouton : ajoute un bouton à l'embed du salon
  new SlashCommandBuilder()
    .setName("config-bouton")
    .setDescription("Ajoute un bouton de vérification à l'embed de ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("id").setDescription("Identifiant unique du bouton (ex: modo)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("label").setDescription("Texte du bouton (ex: ✅ Vérifier Modo)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("role_requis")
        .setDescription("ID du rôle requis sur le serveur A")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("roles_a_donner")
        .setDescription("IDs des rôles à donner ici, séparés par des virgules")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("style")
        .setDescription("Couleur du bouton")
        .setRequired(false)
        .addChoices(
          { name: "Bleu (Primary)", value: "PRIMARY" },
          { name: "Gris (Secondary)", value: "SECONDARY" },
          { name: "Vert (Success)", value: "SUCCESS" },
          { name: "Rouge (Danger)", value: "DANGER" }
        )
    ),

  // /supprimer-bouton : retire un bouton de l'embed
  new SlashCommandBuilder()
    .setName("supprimer-bouton")
    .setDescription("Supprime un bouton de l'embed de ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("id").setDescription("Identifiant du bouton à supprimer").setRequired(true)
    ),

  // /actualiser-embed : repost l'embed avec les boutons actuels
  new SlashCommandBuilder()
    .setName("actualiser-embed")
    .setDescription("Repost l'embed de vérification dans ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

// ─────────────────────────────────────────────
//  ENREGISTREMENT DES COMMANDES
// ─────────────────────────────────────────────
async function registerCommands(guildId) {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), {
      body: commands,
    });
    console.log(`[Commands] Commandes enregistrées sur le serveur ${guildId}`);
  } catch (err) {
    console.error("[Commands] Erreur enregistrement :", err.message);
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const BUTTON_STYLES = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

function buildEmbed(embedConfig) {
  const embed = new EmbedBuilder()
    .setTitle(embedConfig.title)
    .setDescription(embedConfig.description)
    .setColor(embedConfig.color || "#5865F2")
    .setFooter({ text: "Cliquez sur un bouton pour vérifier votre rôle" })
    .setTimestamp();
  return embed;
}

function buildRows(buttons) {
  // Discord limite à 5 boutons par ligne et 5 lignes
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder();
    buttons.slice(i, i + 5).forEach((btn) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`verify:${btn.customId}`)
          .setLabel(btn.label)
          .setStyle(BUTTON_STYLES[btn.style] || ButtonStyle.Primary)
      );
    });
    rows.push(row);
  }
  return rows;
}

async function sendOrUpdateEmbed(channel, embedConfig) {
  const embed = buildEmbed(embedConfig);
  const rows = buildRows(embedConfig.buttons || []);

  // Si un message existe déjà, on le supprime
  if (embedConfig.messageId) {
    try {
      const old = await channel.messages.fetch(embedConfig.messageId);
      await old.delete();
    } catch (_) {}
  }

  const msg = await channel.send({ embeds: [embed], components: rows });
  return msg.id;
}

// ─────────────────────────────────────────────
//  ÉVÉNEMENTS BOT
// ─────────────────────────────────────────────
client.once("ready", () => {
  console.log(`[Bot] Connecté en tant que ${client.user.tag}`);
});

client.on("guildCreate", (guild) => {
  registerCommands(guild.id);
});

client.on("interactionCreate", async (interaction) => {
  // ── SLASH COMMANDS ──────────────────────────
  if (interaction.isChatInputCommand()) {
    const { commandName, channelId } = interaction;

    // /config-embed
    if (commandName === "config-embed") {
      const title = interaction.options.getString("titre");
      const description = interaction.options.getString("description");
      const color = interaction.options.getString("couleur") || "#5865F2";

      let existing = getEmbedConfig(channelId) || { buttons: [] };
      const newConfig = { ...existing, title, description, color };
      setEmbedConfig(channelId, newConfig);

      await interaction.reply({
        content: "✅ Embed configuré ! Utilise `/actualiser-embed` pour le poster.",
        ephemeral: true,
      });
    }

    // /config-bouton
    else if (commandName === "config-bouton") {
      const id = interaction.options.getString("id").replace(/\s+/g, "_");
      const label = interaction.options.getString("label");
      const requiredRoleId = interaction.options.getString("role_requis").trim();
      const rewardRoleIds = interaction.options
        .getString("roles_a_donner")
        .split(",")
        .map((r) => r.trim());
      const style = interaction.options.getString("style") || "PRIMARY";

      let embedConfig = getEmbedConfig(channelId);
      if (!embedConfig) {
        return interaction.reply({
          content: "❌ Configure d'abord l'embed avec `/config-embed`.",
          ephemeral: true,
        });
      }

      // Remplace si l'id existe déjà
      embedConfig.buttons = embedConfig.buttons.filter((b) => b.customId !== id);
      embedConfig.buttons.push({ customId: id, label, style, requiredRoleId, rewardRoleIds });
      setEmbedConfig(channelId, embedConfig);

      await interaction.reply({
        content: `✅ Bouton **${label}** configuré !\n> Rôle requis (serveur A) : \`${requiredRoleId}\`\n> Rôles donnés (ce serveur) : ${rewardRoleIds.map((r) => `\`${r}\``).join(", ")}\n\nUtilise \`/actualiser-embed\` pour mettre à jour l'embed.`,
        ephemeral: true,
      });
    }

    // /supprimer-bouton
    else if (commandName === "supprimer-bouton") {
      const id = interaction.options.getString("id");
      let embedConfig = getEmbedConfig(channelId);
      if (!embedConfig) {
        return interaction.reply({ content: "❌ Aucun embed configuré ici.", ephemeral: true });
      }
      const before = embedConfig.buttons.length;
      embedConfig.buttons = embedConfig.buttons.filter((b) => b.customId !== id);
      if (embedConfig.buttons.length === before) {
        return interaction.reply({ content: `❌ Bouton \`${id}\` introuvable.`, ephemeral: true });
      }
      setEmbedConfig(channelId, embedConfig);
      await interaction.reply({
        content: `✅ Bouton \`${id}\` supprimé. Utilise \`/actualiser-embed\` pour mettre à jour.`,
        ephemeral: true,
      });
    }

    // /actualiser-embed
    else if (commandName === "actualiser-embed") {
      const embedConfig = getEmbedConfig(channelId);
      if (!embedConfig || !embedConfig.title) {
        return interaction.reply({
          content: "❌ Aucun embed configuré. Utilise `/config-embed` d'abord.",
          ephemeral: true,
        });
      }
      try {
        await interaction.reply({ content: "⏳ Posting l'embed...", ephemeral: true });
        const msgId = await sendOrUpdateEmbed(interaction.channel, embedConfig);
        embedConfig.messageId = msgId;
        setEmbedConfig(channelId, embedConfig);
        await interaction.editReply({ content: "✅ Embed posté !" });
      } catch (err) {
        console.error("[actualiser-embed] Erreur:", err.message);
        try { await interaction.editReply({ content: "❌ Erreur lors du post de l'embed. Vérifie les permissions du bot dans ce salon." }); } catch (_) {}
      }
    }
  }

  // ── BOUTONS ──────────────────────────────────
  if (interaction.isButton()) {
    const [prefix, buttonCustomId] = interaction.customId.split(":");
    if (prefix !== "verify") return;

    const embedConfig = getEmbedConfig(interaction.channelId);
    if (!embedConfig) return;

    const buttonConfig = embedConfig.buttons.find((b) => b.customId === buttonCustomId);
    if (!buttonConfig) return;

    // Stocker la vérification en attente
    pendingVerifications.set(interaction.user.id, {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      buttonCustomId,
      requiredRoleId: buttonConfig.requiredRoleId,
      rewardRoleIds: buttonConfig.rewardRoleIds,
    });

    const oauthUrl = buildOAuthUrl(buttonCustomId, interaction.user.id);

    await interaction.reply({
      content: `🔐 **Vérification requise**\n\nClique sur le lien ci-dessous pour t'authentifier avec Discord.\nNous vérifierons ton rôle sur le serveur source, sans que le bot y soit présent.\n\n🔗 [Cliquez ici pour vous vérifier](${oauthUrl})\n\n*Le lien expire dans 10 minutes.*`,
      ephemeral: true,
    });
  }
});

// ─────────────────────────────────────────────
//  OAUTH2 CALLBACK
// ─────────────────────────────────────────────
app.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.send(htmlPage("❌ Erreur", "Paramètres manquants.", false));
  }

  // state = "buttonCustomId:userId"
  const [buttonCustomId, userId] = state.split(":");

  if (!userId || !pendingVerifications.has(userId)) {
    return res.send(htmlPage("❌ Session expirée", "Retourne sur Discord et réessaie.", false));
  }

  const pending = pendingVerifications.get(userId);
  pendingVerifications.delete(userId);

  try {
    // 1. Échange code → access_token
    const tokenData = await exchangeCode(code);

    // 2. Vérifie l'identité (sécurité : s'assurer que c'est bien le bon user)
    const discordUser = await getUser(tokenData.access_token);
    if (discordUser.id !== userId) {
      return res.send(htmlPage("❌ Erreur", "Identité non concordante.", false));
    }

    // 3. Récupère le membre sur le serveur A
    let member;
    try {
      member = await getMemberInGuild(tokenData.access_token, process.env.SOURCE_GUILD_ID);
    } catch (err) {
      return res.send(
        htmlPage(
          "❌ Non membre",
          "Tu ne fais pas partie du serveur source. Rejoins-le d'abord.",
          false
        )
      );
    }

    // 4. Vérifie le rôle requis
    if (!member.roles.includes(pending.requiredRoleId)) {
      return res.send(
        htmlPage(
          "❌ Rôle manquant",
          `Tu n'as pas le rôle requis sur le serveur source.`,
          false
        )
      );
    }

    // 5. Attribue les rôles sur le serveur B
    const guild = client.guilds.cache.get(pending.guildId);
    if (!guild) return res.send(htmlPage("❌ Erreur", "Serveur introuvable.", false));

    const targetMember = await guild.members.fetch(userId).catch(() => null);
    if (!targetMember) {
      return res.send(
        htmlPage("❌ Introuvable", "Tu n'es pas membre de ce serveur Discord.", false)
      );
    }

    const rolesToAdd = pending.rewardRoleIds
      .map((id) => guild.roles.cache.get(id))
      .filter(Boolean);

    if (rolesToAdd.length === 0) {
      return res.send(htmlPage("⚠️ Erreur config", "Les rôles configurés sont introuvables. Contacte un admin.", false));
    }

    await targetMember.roles.add(rolesToAdd);

    return res.send(
      htmlPage(
        "✅ Vérifié !",
        `Tes rôles ont été attribués avec succès : ${rolesToAdd.map((r) => r.name).join(", ")}`,
        true
      )
    );
  } catch (err) {
    console.error("[OAuth] Erreur :", err.response?.data || err.message);
    return res.send(htmlPage("❌ Erreur serveur", "Une erreur est survenue. Réessaie.", false));
  }
});

// ─────────────────────────────────────────────
//  PAGE HTML RÉSULTAT
// ─────────────────────────────────────────────
function htmlPage(title, message, success) {
  const color = success ? "#57F287" : "#ED4245";
  const icon = success ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #23272a;
      font-family: 'Segoe UI', sans-serif;
      color: #fff;
    }
    .card {
      background: #2c2f33;
      border-radius: 16px;
      padding: 48px 40px;
      text-align: center;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      border-top: 4px solid ${color};
    }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 12px; color: ${color}; }
    p { color: #b9bbbe; font-size: 15px; line-height: 1.6; }
    .close { margin-top: 24px; font-size: 13px; color: #72767d; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="close">Tu peux fermer cette fenêtre et retourner sur Discord.</p>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
//  DÉMARRAGE
// ─────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).then(() => {
  // Enregistre les commandes sur tous les serveurs actuels
  client.guilds.cache.forEach((guild) => registerCommands(guild.id));
});
