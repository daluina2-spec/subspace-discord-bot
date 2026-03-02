const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds] // ✅ solo lo necesario
});

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde Pong para probar que el bot está vivo.')
    .toJSON()
];

async function registerCommands() {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token) throw new Error('Falta TOKEN en variables de Railway');
  if (!clientId) throw new Error('Falta CLIENT_ID en variables de Railway');

  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registrados: /ping');
}

client.once('ready', async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('🏓 Pong!');
  }
});

client.login(process.env.TOKEN);
