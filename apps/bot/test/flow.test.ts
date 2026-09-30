import { afterAll, describe, expect, it } from 'vitest';
import { createCharacter, prisma, spin } from '@ego/db';
import { numberedCells } from '../src/match/panel';
import { startMatch } from '../src/match/start';
import { sessions } from '../src/match/session';
import { profileScreen } from '../src/features/profile';
import { MAX_COMPONENTS, countComponents, edit, screen, type Payload, type ScreenSpec } from '../src/ui';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const PREFIX = `bottest-${Date.now()}-`;

/** Valida o payload como o Discord faria: builders.toJSON() + limites. */
function validate(p: Payload) {
  for (const c of p.components) {
    const json = c.toJSON() as { components: { type: number; components?: { custom_id?: string }[] }[] };
    const walk = (x: unknown) => {
      if (!x || typeof x !== 'object') return;
      const o = x as Record<string, unknown>;
      if (typeof o.custom_id === 'string') expect((o.custom_id as string).length).toBeLessThanOrEqual(100);
      for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(walk);
    };
    walk(json);
  }
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

  it('partida 1v1 casual: painel, confirmação, revelação, resolução e fechamento', async () => {
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
    expect(sent.length).toBe(1);
    let guard = 0;
    while (s.phase !== 'finished' && guard++ < 10) {
      expect(s.phase).toBe('planning');
      for (const c of chars) {
        const u = c.discordId;
        const panel: ScreenSpec = s.panel(u);
        expect(countComponents(panel)).toBeLessThanOrEqual(MAX_COMPONENTS);
        validate(edit(panel));
        const slotId = s.slotOfUser(u)!;
        const draft = s.draftFor(u).draft;
        const cells = numberedCells(s.state, slotId, draft);
        const dest = cells[Math.floor(cells.length / 2)];
        let spec = s.click(u, 'dest', '0', [`${dest.x},${dest.y}`]);
        const holder = s.state.ball.holder === slotId;
        spec = s.click(u, 'act', holder ? 'conduzir' : 'mover', null);
        validate(edit(spec));
        spec = s.click(u, 'ok', undefined, null);
        validate(edit(spec));
        expect(s.humanPlans[slotId]).toBeTruthy();
      }
      // todos prontos: a sessão agenda o avanço; força para o teste ser rápido
      await s.proceed();
      await s.resolveNow();
    }
    expect(s.phase).toBe('finished');
    expect(sessions.has(s.id)).toBe(false);
    const m = await prisma.match.findUniqueOrThrow({ where: { id: s.id }, include: { participants: true } });
    expect(m.status).toBe('finished');
    expect((m.turns as unknown[]).length).toBe(3);
    // relatório com recompensas foi enviado
    expect(sent.length).toBeGreaterThanOrEqual(2);
    const humans = m.participants.filter((p) => p.characterId);
    expect(humans.every((p) => p.activeTurns === 3)).toBe(true);
  });
});
