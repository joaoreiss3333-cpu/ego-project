import { Client, Events, GatewayIntentBits } from 'discord.js';
import { GAME } from '@ego/content';
import { abortMatch, prisma, runningMatches } from '@ego/db';
import { ensureFonts } from '@ego/render';
import { ENV } from './env';
import { dispatch } from './router';
import { resumeMatch } from './match/start';
import { sessions } from './match/session';
// registra os handlers
import './features/character';
import './features/profile';
import './features/training';
import './features/progress';
import './features/misc';
import './match/handlers';
import './match/lobby';
import './match/queue';

if (!ENV.token) {
  console.error('Defina DISCORD_TOKEN no .env.');
  process.exit(1);
}

ensureFonts();

// Slash commands e botões não precisam de intents privilegiadas.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`${GAME.name}: conectado como ${c.user.tag}`);
  // retoma partidas que estavam rodando antes de um reinício
  const running = await runningMatches();
  for (const m of running) {
    try {
      const ch = m.channelId ? await c.channels.fetch(m.channelId).catch(() => null) : null;
      if (!ch || !ch.isSendable()) {
        await abortMatch(m.id, 'canal indisponível na retomada');
        continue;
      }
      await resumeMatch(ch, m);
      console.log(`partida ${m.id} retomada`);
    } catch (e) {
      console.error(`falha ao retomar ${m.id}`, e);
      await abortMatch(m.id, 'falha na retomada').catch(() => {});
    }
  }
});

client.on(Events.InteractionCreate, (i) => void dispatch(i));
client.on(Events.Error, (e) => console.error('[discord]', e));

async function shutdown() {
  console.log('encerrando: as partidas em andamento continuam do último lance salvo no próximo início');
  for (const s of sessions.values()) s.unregister();
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

await client.login(ENV.token);
