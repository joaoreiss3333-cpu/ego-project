/**
 * Registra os comandos slash. Com DISCORD_GUILD_ID, registra só naquele servidor
 * (aparece na hora); sem ele, registra global (pode levar até 1 hora).
 */
import { REST, Routes } from 'discord.js';
import { COMMANDS } from './commands';
import { ENV } from './env';

if (!ENV.token || !ENV.clientId) {
  console.error('Defina DISCORD_TOKEN e DISCORD_CLIENT_ID no .env antes de registrar os comandos.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(ENV.token);
const body = COMMANDS.map((c) => c.toJSON());
const route = ENV.guildId ? Routes.applicationGuildCommands(ENV.clientId, ENV.guildId) : Routes.applicationCommands(ENV.clientId);
await rest.put(route, { body });
console.log(`${body.length} comandos registrados ${ENV.guildId ? `no servidor ${ENV.guildId}` : 'globalmente'}.`);
