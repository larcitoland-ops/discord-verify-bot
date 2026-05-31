const express = require("express");

/**
 * Lance un mini serveur HTTP sur le port défini.
 * Sert à garder le bot vivant via UptimeRobot (ping toutes les 5 min).
 *
 * Sur UptimeRobot : crée un monitor "HTTP(s)" pointant vers PUBLIC_URL
 * et le bot ne dormira jamais.
 */
function keepAlive(app) {
  app.get("/", (req, res) => {
    res.send("✅ Bot en ligne !");
  });

  app.get("/ping", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Keep-Alive] Serveur HTTP actif sur le port ${PORT}`);
    console.log(`[Keep-Alive] Configure UptimeRobot sur : ${process.env.PUBLIC_URL || "http://localhost:" + PORT}`);
  });
}

module.exports = { keepAlive };
