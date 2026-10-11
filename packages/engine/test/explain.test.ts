import { describe, expect, it } from 'vitest';
import { autoTurn, botSlot, buildSetup, createMatch, explainTurn, keeperSlot, normalizePlans, resolveTurn, stayPlan, turnCaptions, type MatchState, type RollPart } from '../src';

const sum = (parts?: RollPart[]) => (parts ?? []).reduce((a, p) => a + p.value, 0);

function match(seed: string, mode: '1v1' | '3v3' = '3v3'): { s: MatchState; ids: string[] } {
  const n = Number(mode[0]);
  const slots = [];
  const lin = ['isagi', 'chigiri', 'lavinho', 'gagamaru', 'kuon'];
  for (const t of ['A', 'B'] as const) {
    for (let i = 0; i < n; i++) slots.push(botSlot({ name: `${t} Jogador ${i + 1}`, lineageId: lin[(i + (t === 'B' ? 2 : 0)) % 5], level: 15, personality: 'agressivo', position: 'atacante' }, `${t}${i + 1}`, t, 'elite'));
    slots.push(keeperSlot(`${t}GK`, t, 15));
  }
  return { s: createMatch(buildSetup({ id: 'ex', seed, mode, kind: 'simulacao', slots })), ids: slots.map((x) => x.id) };
}

describe('explicação do lance', () => {
  it('as parcelas de cada rolagem somam o total e todo lance tem explicação', () => {
    let { s, ids } = match('explica');
    for (let i = 0; i < 60 && !s.finished; i++) {
      const r = autoTurn(s, { botIds: ids }).result;
      for (const e of r.events) {
        if (e.t === 'duel') {
          expect(sum(e.atkParts)).toBe(e.atk);
          expect(sum(e.defParts)).toBe(e.def);
        }
        if (e.t === 'pass') {
          expect(sum(e.parts)).toBe(e.roll);
          if (e.result === 'intercepted') expect(sum(e.interceptParts)).toBe(e.interceptRoll);
        }
        if (e.t === 'shot') {
          expect(sum(e.parts)).toBe(e.roll);
          if (e.keeperParts) expect(sum(e.keeperParts)).toBe(e.keeperRoll);
        }
      }
      const ex = explainTurn(s, r);
      expect(ex.story.length).toBeGreaterThan(0);
      expect(ex.choices.length).toBeGreaterThan(0);
      const caps = turnCaptions(s, r);
      for (const e of r.events) if (e.t === 'duel') expect(caps.byStep[e.step]).toContain('DUELO');
      s = r.state;
    }
  });

  it('roubo de bola explica quem disputou, a conta e quem ficou com a bola', () => {
    const { s } = match('roubo', '1v1');
    // atacante conduz; defensor colado dá Bote
    s.players.A1.pos = { x: 4, y: 3 };
    s.players.B1.pos = { x: 5, y: 3 };
    s.ball = { holder: 'A1', pos: { x: 4, y: 3 } };
    const plans = normalizePlans(s, {
      A1: { playerId: 'A1', dest: { x: 4, y: 2 }, action: 'conduzir' },
      B1: { playerId: 'B1', dest: { x: 5, y: 3 }, action: 'bote' },
      AGK: stayPlan(s, 'AGK'),
      BGK: stayPlan(s, 'BGK'),
    });
    const r = resolveTurn(s, plans);
    const duel = r.events.find((e) => e.t === 'duel');
    expect(duel).toBeTruthy();
    const text = explainTurn(s, r).story.join('\n');
    expect(text).toContain('deu Bote');
    expect(text).toContain('dado');
    expect(text).toMatch(r.state.ball.holder === 'B1' ? /tomou a bola/ : /seguiu com a bola/);
  });
});
