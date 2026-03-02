// index.js (PRO - definitivo)
// ✅ Discord bot + API HTTP
// ✅ Seguridad: API_KEY obligatoria (header x-api-key)
// ✅ Healthcheck: GET /health
// ✅ POST /event manda mensaje al canal LOG_CHANNEL_ID
// ✅ Compatible con Railway (PORT)

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const API_KEY = process.env.API_KEY; // 👈 NUEVO (seguridad)
const PORT = process.env.PORT || 8080;

function must(name, value) {
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
}

must("TOKEN", TOKEN);
must("CLIENT_ID", CLIENT_ID);
must("LOG_CHANNEL_ID", LOG_CHANNEL_ID);
must("API_KEY", API_KEY);

// ================== DISCORD CLIENT ==================
const client = new Client({
  intents: [GatewayIntentBits.Guilds], // ✅ solo lo necesario
});

// ================== SLASH COMMANDS (ping) ==================
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Responde Pong para probar que el bot está vivo.")
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🚀 Slash commands registrados: /ping");
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("❌ Error registrando slash commands:", e);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ping") {
      await interaction.reply("🏓 Pong!");
    }
  } catch (e) {
    console.error("❌ Error en InteractionCreate:", e);
  }
});

// ================== EXPRESS API ==================
const app = express();
app.use(express.json({ limit: "256kb" }));

// ✅ Healthcheck (para probar que responde)
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// ✅ Seguridad: exige x-api-key
function requireApiKey(req, res) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

// ✅ Endpoint principal: manda mensaje al canal
app.post("/event", async (req, res) => {
  try {
    if (!requireApiKey(req, res)) return;

    const { type, message } = req.body || {};
    if (!type || !message) {
      return res.status(400).json({
        ok: false,
        error: "Body inválido. Requiere { type, message }",
      });
    }

    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return res.status(400).json({
        ok: false,
        error: "No pude encontrar el canal con LOG_CHANNEL_ID",
      });
    }

    const safeType = String(type).slice(0, 40);
    const safeMsg = String(message).slice(0, 1800);

    await channel.send(`📌 **[${safeType}]** ${safeMsg}`);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("❌ Error /event:", e);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 API server running on port ${PORT}`);
});

// ================== START BOT ==================
client.login(TOKEN);
