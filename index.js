// index.js (FINAL PRO COMMAND CENTER)
// ✅ Discord bot + API HTTP (Railway)
// ✅ POST /event logs (embed)  (Roblox -> Discord)
// ✅ GET /health
// ✅ Command Queue + Roblox Polling: GET /commands + POST /commands/ack
// ✅ Security: x-api-key (logs/admin) + x-roblox-key (roblox polling)
// ✅ Admin roles por nombre: ADMIN_ROLE_NAMES

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
const API_KEY = process.env.API_KEY;         // Para POST /event (Roblox logs) y pruebas externas
const ROBLOX_KEY = process.env.ROBLOX_KEY;   // Para que SOLO Roblox pueda pedir comandos
const PORT = process.env.PORT || 8080;

// Roles permitidos (por nombre exacto, separados por coma)
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

// ================== DISCORD CLIENT ==================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let botReady = false;

// ================== COMMAND QUEUE (IN MEMORY) ==================
const commandQueue = []; // { id, type, payload, createdAt, createdBy, status, result, completedAt }

function makeId() {
  return "cmd_" + crypto.randomBytes(8).toString("hex");
}
function nowIso() {
  return new Date().toISOString();
}

function hasAdminRole(interaction) {
  try {
    const member = interaction.member;
    if (!member || !member.roles || !member.roles.cache) return false;

    for (const [, role] of member.roles.cache) {
      if (ADMIN_ROLE_NAMES.includes(role.name)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function sendLogEmbed(level, title, desc, fields) {
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const color =
    level === "ERROR" ? 0xe74c3c :
    level === "WARN"  ? 0xf1c40f :
                        0x5865f2;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || "")
    .setColor(color)
    .setFooter({ text: "Subspace Control System" })
    .setTimestamp();

  if (Array.isArray(fields)) {
    for (const f of fields) {
      embed.addFields({
        name: String(f.name),
        value: String(f.value),
        inline: !!f.inline
      });
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
    .setDescription("Quitar ban global por UserId")
    .addIntegerOption(o => o.setName("userid").setDescription("UserId").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Razón").setRequired(false)),

  new SlashCommandBuilder()
    .setName("gkick")
    .setDescription("Kick en vivo por UserId (server que lo ejecute)")
    .addIntegerOption(o => o.setName("userid").setDescription("UserId").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Razón").setRequired(false)),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Anuncio global (server que lo ejecute)")
    .addStringOption(o => o.setName("message").setDescription("Mensaje").setRequired(true)),

  new SlashCommandBuilder()
    .setName("spawnboss")
    .setDescription("Spawn boss (server que lo ejecute)")
    .addStringOption(o => o.setName("bossid").setDescription("BossId").setRequired(true))
    .addStringOption(o => o.setName("note").setDescription("Nota opcional").setRequired(false)),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🚀 Slash commands registered");
}

// ================== DISCORD EVENTS ==================
client.once(Events.ClientReady, async () => {
  botReady = true;
  console.log(`✅ Bot online as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("❌ Slash register error:", e);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
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

    await sendLogEmbed("INFO", "🧭 Nuevo comando admin", "Comando encolado para Roblox.", [
      { name: "Type", value: cmd.type, inline: true },
      { name: "CommandId", value: cmd.id, inline: true },
      { name: "By", value: cmd.createdBy, inline: false },
    ]);

    return interaction.reply({ content: `✅ Encolado: **${cmd.type}** (id: ${cmd.id})`, ephemeral: true });
  } catch (e) {
    console.error("❌ interaction error:", e);
    try {
      return interaction.reply({ content: "❌ Error interno.", ephemeral: true });
    } catch {}
  }
});

// ================== EXPRESS API ==================
const app = express();
app.use(express.json({ limit: "256kb" }));

function requireApiKey(req, res) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function requireRobloxKey(req, res) {
  const key = req.headers["x-roblox-key"];
  if (!key || key !== ROBLOX_KEY) {
    res.status(401).json({ ok: false, error: "Roblox Unauthorized" });
    return false;
  }
  return true;
}

// ✅ Health
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    botReady,
    uptimeSeconds: Math.floor(process.uptime()),
    queueSize: commandQueue.filter(c => c.status === "PENDING").length,
  });
});

// ✅ Roblox logs -> Discord (POST /event)
app.post("/event", async (req, res) => {
  try {
    if (!requireApiKey(req, res)) return;
    if (!botReady) return res.status(503).json({ ok: false, error: "Bot not ready" });

    const { type, message } = req.body || {};
    if (!type || !message) {
      return res.status(400).json({ ok: false, error: "Body inválido. Requiere { type, message }" });
    }

    // Sanitizar menciones
    const safeType = String(type).slice(0, 40).toUpperCase().replace(/@everyone|@here/g, "");
    const safeMsg = String(message).slice(0, 1800).replace(/@everyone|@here/g, "");

    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return res.status(400).json({ ok: false, error: "Invalid LOG_CHANNEL_ID" });

    const embed = new EmbedBuilder()
      .setTitle(`📡 ${safeType}`)
      .setDescription(safeMsg)
      .setColor(0x5865f2)
      .setFooter({ text: "Subspace Logs" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("❌ /event error:", e);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// ✅ Roblox polling
app.get("/commands", (req, res) => {
  if (!requireRobloxKey(req, res)) return;

  const pending = commandQueue.filter(c => c.status === "PENDING").slice(0, 25);
  res.status(200).json({ ok: true, commands: pending });
});

// ✅ Roblox ack
app.post("/commands/ack", async (req, res) => {
  try {
    if (!requireRobloxKey(req, res)) return;

    const { id, ok, result } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

    const cmd = commandQueue.find(c => c.id === id);
    if (!cmd) return res.status(404).json({ ok: false, error: "Not found" });

    cmd.status = ok ? "DONE" : "FAILED";
    cmd.result = String(result || "");
    cmd.completedAt = nowIso();

    await sendLogEmbed(ok ? "INFO" : "ERROR",
      ok ? "✅ Comando ejecutado" : "❌ Comando falló",
      "Roblox confirmó el resultado del comando.",
      [
        { name: "Type", value: cmd.type, inline: true },
        { name: "CommandId", value: cmd.id, inline: true },
        { name: "Status", value: cmd.status, inline: true },
        { name: "Result", value: cmd.result || "(empty)", inline: false },
      ]
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("❌ /commands/ack error:", e);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

app.listen(PORT, () => console.log(`🌐 API running on port ${PORT}`));
client.login(TOKEN);
