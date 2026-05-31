const axios = require("axios");

const DISCORD_API = "https://discord.com/api/v10";

/**
 * Génère le lien OAuth2 pour qu'un utilisateur s'authentifie.
 * Le scope "guilds.members.read" permet de lire ses rôles sur n'importe quel serveur.
 *
 * @param {string} state - customId du bouton cliqué (pour retrouver la config après callback)
 * @param {string} userId - ID de l'utilisateur Discord
 */
function buildOAuthUrl(state, userId) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: `${process.env.PUBLIC_URL}/callback`,
    response_type: "code",
    scope: "identify guilds.members.read",
    state: `${state}:${userId}`,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Échange le code OAuth2 contre un access token.
 */
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

  return res.data; // { access_token, token_type, ... }
}

/**
 * Récupère le membre d'un serveur précis via son access_token.
 * Ne nécessite PAS que le bot soit dans ce serveur.
 *
 * @param {string} accessToken
 * @param {string} guildId - ID du serveur A
 * @returns {object} Données du membre (dont .roles = [roleId, ...])
 */
async function getMemberInGuild(accessToken, guildId) {
  const res = await axios.get(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

/**
 * Récupère l'identité de l'utilisateur connecté.
 */
async function getUser(accessToken) {
  const res = await axios.get(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

module.exports = { buildOAuthUrl, exchangeCode, getMemberInGuild, getUser };
