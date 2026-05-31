require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const express = require("express");
const axios = require("axios");
const CONFIG = require("./config");

// ─────────────────────────────────────────────
//  CLIENT DISCORD
// ─────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ─────────────────────────────────────────────
//  EXPRESS (keep-alive + OAuth2 callback)
// ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Bot en ligne !"));
app.get("/ping", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// ─────────────────────────────────────────────
//  OAUTH2 HELPERS
// ─────────────────────────────────────────────
const DISCORD_API = "https://discord.com/api/v10";

function buildOAuthUrl(stateB64) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: `${process.env.PUBLIC_URL}/callback`,
    response_type: "code",
    scope: "identify guilds.members.read",
    state: stateB64,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${process.env.PUBLIC_URL}/callback`,
  });
  const res = await axios.post(`${DISCORD_API}/oauth2/token`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
}

async function getMemberRoles(accessToken) {
  const res = await axios.get(`${DISCORD_API}/users/@me/guilds/${CONFIG.SOURCE_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data.roles; // tableau d'IDs
}

async function getUser(accessToken) {
  const res = await axios.get(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

// ─────────────────────────────────────────────
//  OAUTH2 CALLBACK
// ─────────────────────────────────────────────
app.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  console.log(`[Callback] Reçu — code: ${!!code}, state: ${!!state}`);

  if (!code || !state) {
    return res.send(page("❌ Erreur", "Paramètres manquants.", false));
  }

  // Décode le state (base64 → JSON)
  let stateData;
  try {
    stateData = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
  } catch (e) {
    console.log(`[Callback] State invalide: ${e.message}`);
    return res.send(page("❌ Erreur", "State invalide.", false));
  }

  const { userId, guildId } = stateData;
  console.log(`[Callback] userId=${userId} guildId=${guildId}`);

  try {
    // 1. Échange code → token
    const tokenData = await exchangeCode(code);
    console.log(`[Callback] Token OK`);

    // 2. Vérifie l'identité
    const discordUser = await getUser(tokenData.access_token);
    console.log(`[Callback] User: ${discordUser.username} (${discordUser.id})`);
    if (discordUser.id !== userId) {
      return res.send(page("❌ Erreur", "Identité non concordante.", false));
    }

    // 3. Récupère les rôles sur le serveur A
    let memberRoles;
    try {
      memberRoles = await getMemberRoles(tokenData.access_token);
      console.log(`[Callback] Rôles serveur A: ${memberRoles.join(", ")}`);
    } catch (err) {
      console.log(`[Callback] Pas membre serveur A: ${err.response?.status}`);
      return res.send(page("❌ Non membre", "Tu ne fais pas partie du serveur source.", false));
    }

    // 4. Trouve toutes les règles qui correspondent
    const matchedRules = CONFIG.RULES.filter(rule =>
      memberRoles.includes(rule.requiredRoleId)
    );
    console.log(`[Callback] Règles trouvées: ${matchedRules.map(r => r.name).join(", ") || "aucune"}`);

    if (matchedRules.length === 0) {
      return res.send(page("❌ Aucun rôle", "Tu n'as aucun rôle éligible sur le serveur source.", false));
    }

    // 5. Collecte tous les rôles à donner (sans doublons)
    const allRoleIds = [...new Set(matchedRules.flatMap(r => r.rewardRoleIds))];

    // 6. Récupère le membre sur le serveur B
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.log(`[Callback] Serveur B introuvable: ${guildId}`);
      return res.send(page("❌ Erreur", "Serveur introuvable.", false));
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.send(page("❌ Introuvable", "Tu n'es pas membre de ce serveur.", false));
    }

    // 7. Attribue les rôles
    const rolesToAdd = allRoleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
    console.log(`[Callback] Rôles à ajouter: ${rolesToAdd.map(r => r.name).join(", ")}`);

    if (rolesToAdd.length === 0) {
      return res.send(page("⚠️ Erreur config", "Les rôles configurés sont introuvables. Contacte un admin.", false));
    }

    await member.roles.add(rolesToAdd);
    console.log(`[Callback] ✅ Rôles ajoutés`);

    const roleNames = matchedRules.map(r => r.name).join(", ");
    return res.send(page("✅ Vérifié !", `Rôles attribués : ${roleNames}`, true));

  } catch (err) {
    console.error(`[Callback] Erreur: ${err.response?.data?.message || err.message}`);
    return res.send(page("❌ Erreur serveur", "Une erreur est survenue. Réessaie.", false));
  }
});

// ─────────────────────────────────────────────
//  BOT EVENTS
// ─────────────────────────────────────────────
client.once("clientReady", async () => {
  console.log(`[Bot] Connecté en tant que ${client.user.tag}`);
  // Poste l'embed dans tous les salons configurés via variable CHANNEL_ID
  const channelId = process.env.CHANNEL_ID;
  if (channelId) {
    const channel = client.channels.cache.get(channelId);
    if (channel) await postEmbed(channel);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "verify") return;

  const stateData = Buffer.from(JSON.stringify({
    userId: interaction.user.id,
    guildId: interaction.guildId,
  })).toString("base64");

  const oauthUrl = buildOAuthUrl(stateData);

  await interaction.reply({
    content: `🔐 **Vérification requise**\n\nClique sur le lien pour t'authentifier avec Discord.\nOn vérifiera tes rôles automatiquement.\n\n🔗 [Cliquez ici pour vous vérifier](${oauthUrl})\n\n*Le lien expire dans 10 minutes.*`,
    flags: 64, // ephemeral
  });
});

// ─────────────────────────────────────────────
//  POST EMBED
// ─────────────────────────────────────────────
async function postEmbed(channel) {
  const embed = new EmbedBuilder()
    .setTitle(CONFIG.EMBED.title)
    .setDescription(CONFIG.EMBED.description)
    .setColor(CONFIG.EMBED.color)
    .setFooter({ text: "Vérification automatique • Aucune donnée stockée" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify")
      .setLabel(CONFIG.EMBED.buttonLabel)
      .setStyle(ButtonStyle.Primary)
  );

  // Supprime les anciens messages du bot dans ce salon
  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    for (const msg of botMessages.values()) await msg.delete().catch(() => {});
  } catch (_) {}

  await channel.send({ embeds: [embed], components: [row] });
  console.log(`[Bot] Embed posté dans #${channel.name}`);
}

// ─────────────────────────────────────────────
//  PAGE HTML
// ─────────────────────────────────────────────
function page(title, message, success) {
  const color = success ? "#57F287" : "#ED4245";
  const icon = success ? "✅" : "❌";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#23272a;font-family:'Segoe UI',sans-serif;color:#fff}.card{background:#2c2f33;border-radius:16px;padding:48px 40px;text-align:center;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);border-top:4px solid ${color}}.icon{font-size:56px;margin-bottom:16px}h1{font-size:24px;margin-bottom:12px;color:${color}}p{color:#b9bbbe;font-size:15px;line-height:1.6}.close{margin-top:24px;font-size:13px;color:#72767d}</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p><p class="close">Tu peux fermer cette fenêtre et retourner sur Discord.</p></div></body></html>`;
}

// ─────────────────────────────────────────────
//  DÉMARRAGE
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] HTTP sur le port ${PORT}`);
  console.log(`[Server] UptimeRobot → ${process.env.PUBLIC_URL}/ping`);
});

client.login(process.env.DISCORD_TOKEN);
