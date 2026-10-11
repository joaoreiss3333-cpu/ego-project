import { afterAll, describe, expect, it } from 'vitest';
import { turnos } from '@ego/engine';
import { createCharacter, prisma, spin } from '@ego/db';
import { startMatch } from '../src/match/start';
import { sessions } from '../src/match/session';
import { profileScreen } from '../src/features/profile';
import { MAX_COMPONENTS, countComponents, screen, type Payload } from '../src/ui';

// os bots jogam sem pausa nos testes
process.env.EGO_BOT_DELAY_MS = '0';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const PREFIX = `bottest-${Date.now()}-`;

/** Valida o payload como o Discord faria: builders.toJSON() + limites. */
function validate(p: Payload) {
  // Components V2: no máximo 4000 caracteres de texto somando a mensagem inteira
  const all = JSON.stringify(p.components.map((c) => c.toJSON()));
  const texts = [...all.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
  expect(texts.reduce((a, t) => a + t.length, 0)).toBeLessThanOrEqual(4000);
  for (const m of all.matchAll(/"custom_id":"([^"]*)"/g)) expect(m[1].length).toBeLessThanOrEqual(100);
}

function fakeChannel() {
  const sent: Payload[] = [];
  const edits: Payload[] = [];
  const channel = {
    id: `chan-${Math.random()}`,
    isSendable: () => true,
    send: async (p: Payload) => {
      validate(p);
      sent.push(p);
      const msg = {
        id: `msg-${sent.length}`,
        edit: async (q: Payload) => {
          validate(q);
          edits.push(q);
          return msg;
        },
      };
      return msg;
    },
  };
  return { channel, sent, edits };
}

const until = async (cond: () => boolean, ms = 20_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando a partida: ' + [...sessions.values()].map((x) => x.phase + ' actor=' + x.actor() + ' turn=' + x.state.turnCount + ' fin=' + x.state.finished).join(' | '));
    await new Promise((r) => setTimeout(r, 5));
  }
};

d('bot: fluxo completo sem Discord', () => {
  afterAll(async () => {
    await prisma.character.deleteMany({ where: { discordId: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('telas de perfil respeitam o limite de componentes', async () => {
    const c = await createCharacter({ discordId: `${PREFIX}p`, guildId: 'g-bot', discordName: 'x', name: 'Perfil Teste', number: 7, position: 'meio', foot: 'ambos', tokenColor: '#22C3E6' });
    await spin(c.id);
    for (const tab of ['resumo', 'atributos', 'linhagem', 'equipamentos', 'cosmeticos', 'maestria'] as const) {
      const spec = await profileScreen(c.discordId, c.discordId, tab);
      expect(countComponents(spec)).toBeLessThanOrEqual(MAX_COMPONENTS);
      validate(screen(spec));
    }
  });

  it('partida 1v1 casual: dois jogadores usam o painel, os bots jogam e a partida fecha no banco', async () => {
    const chars = [];
    for (const n of [1, 2]) {
      const c = await createCharacter({ discordId: `${PREFIX}${n}`, guildId: 'g-bot', discordName: 'x', name: `Jogador ${n}`, number: n, position: 'atacante', foot: 'direito', tokenColor: '#1F6BFF' });
      await spin(c.id);
      chars.push((await prisma.character.findUniqueOrThrow({ where: { id: c.id } }))!);
    }
    const { channel, sent } = fakeChannel();
    const s = await startMatch({
      guildId: 'g-bot',
      channel: channel as never,
      mode: '1v1',
      kind: 'casual',
      teamA: [{ userId: chars[0].discordId, character: chars[0] }],
      teamB: [{ userId: chars[1].discordId, character: chars[1] }],
      rules: { turnsPerHalf: 3, halves: 1, firstTo: null },
      label: '1v1 · Casual',
    });
    let plays = 0;
    let panels = 0;
    while (!s.state.finished) {
      await until(() => s.phase === 'turn' || s.phase === 'guess' || s.state.finished);
      if (s.state.finished) break;
      if (s.phase === 'guess') {
        // goleiro humano não há neste teste, mas o painel de palpite precisa existir só para ele
        throw new Error('palpite inesperado');
      }
      const actor = s.actor();
      const userId = s.participants.find((p) => p.slotId === actor)!.userId;
      // o painel abre e é válido
      validate(screen(s.panel(userId)));
      panels++;
      // joga a decisão da IA pelo caminho real dos humanos
      await s.humanAct(userId, turnos.chooseAction(s.state, actor));
      plays++;
    }
    await until(() => !sessions.has(s.id));
    expect(s.phase).toBe('finished');
    expect(panels).toBe(plays);
    const m = await prisma.match.findUniqueOrThrow({ where: { id: s.id }, include: { participants: true } });
    expect(m.status).toBe('finished');
    expect((m.turns as unknown[]).length).toBe(s.turns.length);
    expect((m.snapshot as { engine?: string }).engine).toBe('turnos');
    const humans = m.participants.filter((p) => p.characterId);
    expect(humans.length).toBe(2);
    expect(humans.every((p) => p.activeTurns === 3 && p.totalTurns === 3)).toBe(true);
    // relatório final com recompensas
    expect(sent.length).toBeGreaterThan(2);
  });

  it('quem não joga a tempo só perde a vez', async () => {
    const c = await createCharacter({ discordId: `${PREFIX}3`, guildId: 'g-bot', discordName: 'x', name: 'Jogador 3', number: 3, position: 'atacante', foot: 'direito', tokenColor: '#1F6BFF' });
    await spin(c.id);
    const ch = (await prisma.character.findUniqueOrThrow({ where: { id: c.id } }))!;
    const { channel } = fakeChannel();
    const s = await startMatch({
      guildId: 'g-bot',
      channel: channel as never,
      mode: '1v1',
      kind: 'casual',
      teamA: [{ userId: ch.discordId, character: ch }],
      teamB: [],
      rules: { turnsPerHalf: 1, halves: 1, firstTo: null },
      label: '1v1 · Casual',
    });
    await until(() => s.phase === 'turn');
    const slot = s.actor();
    s.leave(ch.discordId); // sair equivale a estourar o tempo: a vez passa e a IA assume
    await until(() => !sessions.has(s.id));
    expect(s.state.finished).toBe(true);
    expect(s.state.players[slot].stats.totalTurns).toBeGreaterThan(0);
  });
});
