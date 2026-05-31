# 🤖 Discord Verify Bot

Bot de vérification cross-server via OAuth2.  
**Le bot n'a pas besoin d'être dans le serveur A.** Il vérifie les rôles de l'utilisateur via OAuth2 Discord.

---

## 📁 Structure

```
discord-verify-bot/
├── index.js        # Bot principal + commandes slash + callback OAuth2
├── oauth.js        # Logique OAuth2 Discord
├── config.js       # Gestion de la config (config.json)
├── keep_alive.js   # Serveur HTTP pour UptimeRobot
├── config.json     # Généré automatiquement au démarrage
├── package.json
└── .env            # Tes variables d'environnement (copie .env.example)
```

---

## ⚙️ Installation

### 1. Créer l'application Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Crée une **New Application**
3. Onglet **Bot** → Crée un bot → copie le **Token**
4. Onglet **General Information** → copie **Client ID** et **Client Secret**
5. Onglet **OAuth2 → Redirects** → Ajoute : `https://TON_URL/callback`
6. Active **Server Members Intent** dans l'onglet Bot

### 2. Inviter le bot sur le serveur B uniquement

Génère un lien d'invitation avec les permissions :
- `Manage Roles`
- `Read Messages`
- `Send Messages`
- `Use Application Commands`

```
https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&permissions=268437504&scope=bot+applications.commands
```

### 3. Configurer les variables d'environnement

Copie `.env.example` en `.env` et remplis :

```env
DISCORD_TOKEN=ton_token
CLIENT_ID=ton_client_id
CLIENT_SECRET=ton_client_secret
SOURCE_GUILD_ID=id_du_serveur_a
PUBLIC_URL=https://ton-url.com
PORT=3000
```

### 4. Installer et lancer

```bash
npm install
npm start
```

---

## 🎮 Utilisation

### Créer un embed de vérification

```
/config-embed titre:"🛡️ Vérification des rôles" description:"Clique sur le bouton correspondant à ton rôle."
```

### Ajouter un bouton

```
/config-bouton id:modo label:"✅ Moderateur" role_requis:123456789 roles_a_donner:987654321,111222333 style:SUCCESS
```

- `id` : identifiant unique (pas d'espaces)
- `label` : texte affiché sur le bouton
- `role_requis` : ID du rôle sur le **serveur A**
- `roles_a_donner` : IDs des rôles à attribuer sur **ce serveur**, séparés par des virgules
- `style` : Bleu / Gris / Vert / Rouge

### Poster l'embed

```
/actualiser-embed
```

### Supprimer un bouton

```
/supprimer-bouton id:modo
```

---

## 🔄 Keep-Alive (UptimeRobot)

Le bot héberge un serveur HTTP sur `PUBLIC_URL`.  
Pour qu'il ne dorme jamais :

1. Crée un compte sur [uptimerobot.com](https://uptimerobot.com)
2. Crée un monitor **HTTP(s)**
3. URL : `https://ton-url.com/ping`
4. Intervalle : **5 minutes**

C'est tout — le bot reste éveillé indéfiniment.

---

## 🔐 Comment fonctionne OAuth2 cross-server

```
Utilisateur clique bouton
        │
        ▼
Bot envoie un lien OAuth2 (ephemeral)
        │
        ▼
Utilisateur s'authentifie sur Discord
        │
        ▼
Discord redirige vers /callback avec un code
        │
        ▼
Bot échange le code contre un access_token
        │
        ▼
Bot appelle GET /users/@me/guilds/{SERVEUR_A}/member
→ Retourne les rôles de l'utilisateur sur le serveur A
→ Sans que le bot y soit présent ✅
        │
        ▼
Rôle requis présent ? → Attribue les rôles sur serveur B
```

---

## 🚀 Hébergement recommandé

| Plateforme | Prix | Notes |
|---|---|---|
| [Railway](https://railway.app) | Gratuit (500h/mois) | Simple, supporte Node.js |
| [Render](https://render.com) | Gratuit | Doit pinger via UptimeRobot |
| [Fly.io](https://fly.io) | Gratuit (3 VMs) | Plus technique |
| VPS (OVH, Hetzner) | ~3€/mois | Full contrôle |
