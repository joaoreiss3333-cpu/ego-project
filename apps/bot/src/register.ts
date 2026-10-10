/**
 * Registra os comandos slash. Com DISCORD_GUILD_ID, registra só naquele servidor
 * (aparece na hora); sem ele, registra global (pode levar até 1 hora).
 */
import { DiscordAPIError, REST, Routes } from 'discord.js';
import { COMMANDS } from './commands';
import { ENV } from './env';

/** View Channels, Send Messages, Embed Links, Attach Files, Read Message History. */
const PERMISSIONS = 1024 + 2048 + 16384 + 32768 + 65536;

export function inviteUrl(clientId: string, guildId?: string | null): string {
  const q = new URLSearchParams({ client_id: clientId, scope: 'bot applications.commands', permissions: String(PERMISSIONS) });
  if (guildId) q.set('guild_id', guildId);
  return `https://discord.com/oauth2/authorize?${q.toString()}`;
}

async function main() {
  if (!ENV.token || !ENV.clientId) {
    console.error('Defina DISCORD_TOKEN e DISCORD_CLIENT_ID no .env antes de registrar os comandos.');
    return 1;
  }
  const rest = new REST({ version: '10' }).setToken(ENV.token);
  const body = COMMANDS.map((c) => c.toJSON());
  const route = ENV.guildId ? Routes.applicationGuildCommands(ENV.clientId, ENV.guildId) : Routes.applicationCommands(ENV.clientId);
  try {
    await rest.put(route, { body });
    console.log(`${body.length} comandos registrados ${ENV.guildId ? `no servidor ${ENV.guildId}` : 'globalmente'}.`);
    return 0;
  } catch (e) {
    if (e instanceof DiscordAPIError && e.code === 50001) {
      console.error('O bot ainda não está nesse servidor (Missing Access). Convide-o por este link e rode o registro de novo:');
      console.error(inviteUrl(ENV.clientId, ENV.guildId));
      return 1;
    }
    console.error('Falha ao registrar os comandos:', e instanceof Error ? e.message : e);
    return 1;
  }
}

process.exitCode = await main();
