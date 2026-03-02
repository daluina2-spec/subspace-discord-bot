// ============================================================
// SUBSPACE DISCORD CONTROL SERVER - ULTRA PRO EDITION
// Production Ready - Railway Compatible
// ============================================================
// Features:
// - Discord Bot
// - Secure HTTP API
// - x-api-key authentication
// - Rate limiting (anti spam)
// - Input validation
// - Embed formatting (professional)
// - Health endpoint
// - Global error handling
// - Clean architecture
// ============================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

// ================= ENV =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 8080;

// ========= REQUIRED ENV VALIDATION =========
function must(name, value) {
  if (!value) {
    console.error(`❌ Missing environment variable: ${name}`);
    process.exit(1);
  }
}

must("TOKEN", TOKEN);
must("CLIENT_ID", CLIENT_ID);
must("LOG_CHANNEL_ID", LOG_CHANNEL_ID);
must("API_KEY", API_KEY);

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let botReady = false;

client.once(Events.ClientReady, async () => {
  botReady = true;
  console.log(`✅ Bot online as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error("❌ Slash registration error:", err);
  }
});

// ================= SLASH COMMAND =================
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Health check command")
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🚀 Slash commands registered");
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("🏓 Pong!");
  }
});

// ================= EXPRESS =================
const app = express();
app.use(express.json({ limit: "256kb" }));

// ========== RATE LIMIT (Anti Spam) ==========
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/event", limiter);

// ================= SECURITY =================
function requireApiKey(req, res) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return true;
}

// ================= HEALTH =================
app.get("/health", (req, res) => {
  return res.status(200).json({
    ok: true,
    botReady,
    uptime: process.uptime(),
  });
});

// ================= HELPER =================
function sanitize(input) {
  return String(input).replace(/@everyone|@here/g, "").trim();
}

function colorByType(type) {
  const map = {
    INFO: 0x3498db,
    SUCCESS: 0x2ecc71,
    WARNING: 0xf1c40f,
    ERROR: 0xe74c3c,
    TEST: 0x5865f2,
  };
  return map[type] || 0x5865f2;
}

// ================= MAIN EVENT =================
app.post("/event", async (req, res) => {
  try {
    if (!requireApiKey(req, res)) return;

    if (!botReady) {
      return res.status(503).json({ ok: false, error: "Bot not ready" });
    }

    const { type, message } = req.body || {};

    if (!type || !message) {
      return res.status(400).json({
        ok: false,
        error: "Body must contain { type, message }",
      });
    }

    const safeType = sanitize(type).slice(0, 40).toUpperCase();
    const safeMsg = sanitize(message).slice(0, 1800);

    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return res.status(400).json({
        ok: false,
        error: "Invalid LOG_CHANNEL_ID",
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📡 ${safeType}`)
      .setDescription(safeMsg)
      .setColor(colorByType(safeType))
      .setFooter({ text: "Subspace Control System" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    console.log(`📨 Event sent: ${safeType}`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ /event error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// ================= GLOBAL ERROR HANDLER =================
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`🌐 API running on port ${PORT}`);
});

// ================= LOGIN =================
client.login(TOKEN);
