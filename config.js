// ============================================================
//  CONFIG — Règles de vérification cross-server
//  Modifie ce fichier pour ajouter/supprimer des rôles
// ============================================================

module.exports = {

  // ID du serveur A (celui où on vérifie les rôles, sans que le bot y soit)
  SOURCE_GUILD_ID: "1372606465663045642",

  // Titre et description de l'embed posté sur ton serveur
  EMBED: {
    title: "🛡️ Vérification des rôles | Horizon",
    description: "Clique sur le bouton ci-dessous pour vérifier ton rôle.\nNous vérifierons automatiquement tes accès sur le serveur source et t'attribuerons les rôles correspondants ici.",
    color: "#5865F2",
    buttonLabel: "✅ Vérifier mon rôle",
  },

  // Règles : ordre important — la première correspondance trouvée s'applique en premier
  // Le bot vérifie TOUTES les règles et attribue tous les rôles qui correspondent
  RULES: [
    {
      name: "Direction",
      requiredRoleId: "1510657797824577596",
      rewardRoleIds: ["1510710434158739637", "1510711400388100218"],
    },
    {
      name: "Admin",
      requiredRoleId: "1510657801758707892",
      rewardRoleIds: ["1510710452848562256", "1510712218549751970", "1510710313438281799"],
    },
    {
      name: "Gérant Staffs",
      requiredRoleId: "1510657802840834138",
      rewardRoleIds: ["1510710468661084300", "1510712218549751970"],
    },
    {
      name: "Responsable Modo/Staff",
      requiredRoleId: "1510657803876827196",
      rewardRoleIds: ["1510711539072499874", "1510712218549751970"],
    },
    {
      name: "Responsable Communication",
      requiredRoleId: "1510657806670368963",
      rewardRoleIds: ["1510711602247242020", "1510712218549751970"],
    },
    {
      name: "Responsable Helper/Support",
      requiredRoleId: "1510657806670368963",
      rewardRoleIds: ["1510711561768145006", "1510712218549751970"],
    },
    {
      name: "Modérateur",
      requiredRoleId: "1510657808708669450",
      rewardRoleIds: ["1510711612330348685", "1510712218549751970"],
    },
    {
      name: "Helper",
      requiredRoleId: "1510657815436328981",
      rewardRoleIds: ["1510711709164240936", "1510712218549751970"],
    },
    {
      name: "Support",
      requiredRoleId: "1510657814559719534",
      rewardRoleIds: ["1510711680261160991", "1510712218549751970"],
    },
  ],
};
