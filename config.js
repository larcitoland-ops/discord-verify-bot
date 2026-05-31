const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");

// Structure par défaut
const DEFAULT_CONFIG = {
  embeds: {},
  // embeds[channelId] = {
  //   messageId: string,
  //   title: string,
  //   description: string,
  //   color: string,
  //   buttons: [
  //     {
  //       customId: string,       // ex: "verify_modo"
  //       label: string,          // ex: "✅ Vérifier Modo"
  //       style: string,          // PRIMARY | SECONDARY | SUCCESS | DANGER
  //       requiredRoleId: string, // rôle requis sur serveur A
  //       rewardRoleIds: [string] // rôles à donner sur serveur B
  //     }
  //   ]
  // }
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function getEmbedConfig(channelId) {
  const config = loadConfig();
  return config.embeds[channelId] || null;
}

function setEmbedConfig(channelId, embedData) {
  const config = loadConfig();
  config.embeds[channelId] = embedData;
  saveConfig(config);
}

function getAllEmbeds() {
  const config = loadConfig();
  return config.embeds;
}

module.exports = { loadConfig, saveConfig, getEmbedConfig, setEmbedConfig, getAllEmbeds };
