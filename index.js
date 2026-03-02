const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const express = require("express");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// ====== DISCORD CLIENT ======
const client = new Client({
  intents: [GatewayIntentBits.Guilds], // ✅ solo lo necesario
});

client.once("clientReady", () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

// ====== SLASH COMMANDS (REGISTER ON START) ======
async function registerCommands() {
  if (!TOKEN) throw new Error("Falta TOKEN en Railway Variables");
  if (!CLIENT_ID) throw new Error("Falta CLIENT_ID en Railway Variables");

  const commands = [
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Responde Pong para probar que el bot está vivo.")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🚀 Slash commands registrados: /ping");
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
      await interaction.reply("🏓 Pong!");
    }
  } catch (err) {
    console.error("❌ Error en interactionCreate:", err);
  }
});

// ====== EXPRESS API ======
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/event", async (req, res) => {
  try {
    const { type, message } = req.body || {};

    if (!type || !message) {
      return res.status(400).json({ ok: false, error: "Falta 'type' o 'message' en body" });
    }

    if (!LOG_CHANNEL_ID) {
      return res.status(500).json({ ok: false, error: "Falta LOG_CHANNEL_ID en Railway Variables" });
    }

    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return res.status(500).json({ ok: false, error: "No pude encontrar el canal con LOG_CHANNEL_ID" });
    }

    await channel.send(`📌 **[${type}]** ${message}`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error en POST /event:", err);
    return res.status(500).json({ ok: false, error: "Error interno enviando a Discord" });
  }
});

// IMPORTANTÍSIMO: Railway usa process.env.PORT
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 API server running on port ${PORT}`);
});

// ====== START EVERYTHING ======
(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (err) {
    console.error("❌ Error iniciando bot:", err);
    process.exit(1);
  }
})();
