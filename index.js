// index.js (FINAL PRO COMMAND CENTER CORRECTED)

const express = require("express");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

// ================== ENV ==================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const API_KEY = process.env.API_KEY;
const ROBLOX_KEY = process.env.ROBLOX_KEY;
const PORT = process.env.PORT || 8080;

const ADMIN_ROLE_NAMES = (process.env.ADMIN_ROLE_NAMES || "Admin,Vault Overseer,Nexus Keeper")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function must(name, v) {
  if (!v) {
    console.error(`❌ Missing env var: ${name}`);
    process.exit(1);
  }
}

must("TOKEN", TOKEN);
must("CLIENT_ID", CLIENT_ID);
must("LOG_CHANNEL_ID", LOG_CHANNEL_ID);
must("API_KEY", API_KEY);
must("ROBLOX_KEY", ROBLOX_KEY);

// ================== DISCORD ==================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let botReady = false;

// ================== COMMAND QUEUE ==================
const commandQueue = [];

function makeId() {
  return "cmd_" + crypto.randomBytes(8).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function hasAdminRole(interaction) {
  const member = interaction.member;
  if (!member?.roles?.cache) return false;

  for (const [, role] of member.roles.cache) {
    if (ADMIN_ROLE_NAMES.includes(role.name)) return true;
  }
  return false;
}

async function sendLogEmbed(type, title, desc, fields) {
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || "")
    .setColor(type === "ERROR" ? 0xe74c3c : type === "WARN" ? 0xf1c40f : 0x5865f2)
    .setFooter({ text: "Subspace Control System" })
    .setTimestamp();

  if (Array.isArray(fields)) {
    for (const f of fields) {
      embed.addFields({ name: String(f.name), value: String(f.value), inline: !!f.inline });
    }
  }

  await channel.send({ embeds: [embed] });
}

// ================== SLASH COMMANDS ==================
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Health check"),

  new SlashCommandBuilder()
    .setName("gban")
    .setDescription("Ban global por UserId")
    .addIntegerOption(o => o.setName("userid").setDescription("UserId").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Razón").setRequired(false)),

  new SlashCommandBuilder()
    .setName("gunban")
    .setDescription("Quitar ban global")
    .addIntegerOption(o => o.setName("userid").setDescription("UserId").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Razón").setRequired(false)),

  new SlashCommandBuilder()
    .setName("gkick")
    .setDescription("Kick en vivo")
    .addIntegerOption(o => o.setName("userid").setDescription("UserId").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Razón").setRequired(false)),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Anuncio global")
    .addStringOption(o => o.setName("message").setDescription("Mensaje").setRequired(true)),

  new SlashCommandBuilder()
    .setName("spawnboss")
    .setDescription("Spawn boss")
    .addStringOption(o => o.setName("bossid").setDescription("BossId").setRequired(true))
    .addStringOption(o => o.setName("note").setDescription("Nota").setRequired(false)),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🚀 Slash commands registered");
}

client.once(Events.ClientReady, async () => {
  botReady = true;
  console.log(`✅ Bot online as ${client.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "ping" && !hasAdminRole(interaction)) {
    return interaction.reply({ content: "❌ No tienes permisos.", ephemeral: true });
  }

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  const id = makeId();
  const createdBy = `${interaction.user.username} (${interaction.user.id})`;
  let cmd = null;

  // ✅ CORREGIDO: ahora coinciden con gban / gunban / gkick

  if (interaction.commandName === "gban") {
    const userId = interaction.options.getInteger("userid");
    const reason = interaction.options.getString("reason") || "No reason";
    cmd = { id, type: "BAN", payload: { userId, reason }, createdAt: nowIso(), createdBy, status: "PENDING" };
  }

  if (interaction.commandName === "gunban") {
    const userId = interaction.options.getInteger("userid");
    const reason = interaction.options.getString("reason") || "No reason";
    cmd = { id, type: "UNBAN", payload: { userId, reason }, createdAt: nowIso(), createdBy, status: "PENDING" };
  }

  if (interaction.commandName === "gkick") {
    const userId = interaction.options.getInteger("userid");
    const reason = interaction.options.getString("reason") || "No reason";
    cmd = { id, type: "KICK", payload: { userId, reason }, createdAt: nowIso(), createdBy, status: "PENDING" };
  }

  if (interaction.commandName === "announce") {
    const message = interaction.options.getString("message");
    cmd = { id, type: "ANNOUNCE", payload: { message }, createdAt: nowIso(), createdBy, status: "PENDING" };
  }

  if (interaction.commandName === "spawnboss") {
    const bossId = interaction.options.getString("bossid");
    const note = interaction.options.getString("note") || "";
    cmd = { id, type: "SPAWN_BOSS", payload: { bossId, note }, createdAt: nowIso(), createdBy, status: "PENDING" };
  }

  if (!cmd) {
    return interaction.reply({ content: "❌ Comando inválido.", ephemeral: true });
  }

  commandQueue.push(cmd);

  await sendLogEmbed(
    "INFO",
    "🧭 Nuevo comando admin",
    "Comando enviado a Roblox.",
    [
      { name: "Type", value: cmd.type, inline: true },
      { name: "CommandId", value: cmd.id, inline: true },
      { name: "By", value: cmd.createdBy, inline: false },
    ]
  );

  return interaction.reply({ content: `✅ Encolado: ${cmd.type} (${cmd.id})`, ephemeral: true });
});

// ================== EXPRESS ==================
const app = express();
app.use(express.json());

function requireApiKey(req, res) {
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return true;
}

function requireRobloxKey(req, res) {
  if (req.headers["x-roblox-key"] !== ROBLOX_KEY) {
    return res.status(401).json({ ok: false, error: "Roblox Unauthorized" });
  }
  return true;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    botReady,
    uptime: Math.floor(process.uptime()),
    queueSize: commandQueue.length
  });
});

app.get("/commands", (req, res) => {
  if (!requireRobloxKey(req, res)) return;
  const pending = commandQueue.filter(c => c.status === "PENDING");
  res.json({ ok: true, commands: pending.slice(0, 25) });
});

app.listen(PORT, () => console.log(`🌐 API running on port ${PORT}`));
client.login(TOKEN);
