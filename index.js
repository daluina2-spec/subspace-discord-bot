const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde Pong para probar que el bot está vivo.')
    .toJSON()
];

async function registerCommands() {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('🚀 Slash commands registrados: /ping');
}

client.once('ready', async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('🏓 Pong!');
  }
});

client.login(process.env.TOKEN);

// ===== EXPRESS SERVER PARA ROBLOX =====

app.post('/event', async (req, res) => {
  const { type, message } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
  if (channel) {
    await channel.send(`📡 [${type}] ${message}`);
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 API server running on port ${PORT}`);
});
