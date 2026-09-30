import { describe, expect, it } from 'vitest';
import type { Difficulty } from '@ego/content';
import {
  autoTurn,
  botSlot,
  buildSetup,
  createMatch,
  planTeam,

  keeperSlot,
  type MatchState,
  type PlanMap,
  type RevealedPlan,
  type SlotSetup,
  type Team,
} from '../src';
import { makeMatch, place, plan, slot } from '../src/testing';

function withTurn(s: MatchState, turn: number): MatchState {
  return { ...s, turn, setup: { ...s.setup, seed: `${s.setup.seed}-${turn}` } };
}

function count<T extends string>(xs: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

function base2v2(diff: Difficulty = 'elite') {
  return makeMatch('2v2', [
    slot({ id: 'A1', team: 'A', isBot: true, difficulty: diff, attrs: { passe: 7, drible: 5 } }),
    slot({ id: 'A2', team: 'A', isBot: true, difficulty: diff, attrs: { chute: 7 } }),
    slot({ id: 'AGK', team: 'A', isKeeper: true, isBot: true, difficulty: diff }),
    slot({ id: 'B1', team: 'B', isBot: true, difficulty: diff, attrs: { defesa: 7 } }),
    slot({ id: 'B2', team: 'B', isBot: true, difficulty: diff }),
    slot({ id: 'BGK', team: 'B', isKeeper: true, isBot: true, difficulty: diff }),
  ]);
}

describe('IA: testes de situação', () => {
  it('aliado livre na cara do gol: o portador passa', () => {
    const actions: string[] = [];
    for (let t = 1; t <= 30; t++) {
      const s = withTurn(place(base2v2(), { A1: { x: 4, y: 3 }, A2: { x: 8, y: 1 }, B1: { x: 5, y: 4 }, B2: { x: 1, y: 6 } }, 'A1'), t);
      const { plans } = planTeam(s, 'A', ['A1', 'A2', 'AGK']);
      actions.push(plans.A1.action);
    }
    const c = count(actions);
    const passes = (c.passe_pe ?? 0) + (c.passe_espaco ?? 0) + (c.tabela ?? 0);
    expect(passes).toBeGreaterThanOrEqual(18);
  });

  it('portador cercado por dois: passa ou protege, não dribla', () => {
    const actions: string[] = [];
    for (let t = 1; t <= 30; t++) {
      const s = withTurn(place(base2v2(), { A1: { x: 5, y: 3 }, A2: { x: 3, y: 5 }, B1: { x: 6, y: 3 }, B2: { x: 6, y: 2 } }, 'A1'), t);
      const { plans } = planTeam(s, 'A', ['A1', 'A2', 'AGK']);
      actions.push(plans.A1.action);
    }
    const c = count(actions);
    const safe = (c.passe_pe ?? 0) + (c.passe_espaco ?? 0) + (c.proteger ?? 0) + (c.tabela ?? 0);
    expect(safe).toBeGreaterThan(15);
    expect(c.driblar ?? 0).toBeLessThanOrEqual(6);
  });

  it('adversário sempre dribla: o bot passa a Conter mais', () => {
    // o portador vinha protegendo (resposta ótima: Bote); depois passa a driblar sempre.
    // Pela matriz, contra drible o Conter dá +2 à defesa: o bot deve migrar para Conter.
    const rp = (action: 'proteger' | 'driblar'): RevealedPlan => ({ playerId: 'A1', action, from: { x: 5, y: 3 }, dest: { x: 7, y: 3 }, context: 'carrier_contact', hadBall: true });
    const decide = (dribbles: number) => {
      const out: string[] = [];
      for (let t = 40; t < 80; t++) {
        const s = withTurn(place(base2v2(), { A1: { x: 5, y: 3 }, A2: { x: 2, y: 6 }, B1: { x: 7, y: 3 }, B2: { x: 9, y: 0 } }, 'A1'), t);
        let turn = t - 36;
        for (let h = 0; h < 14; h++) s.history.push({ turn: turn++, plans: [rp('proteger')], events: [] });
        for (let h = 0; h < dribbles; h++) s.history.push({ turn: turn++, plans: [rp('driblar')], events: [] });
        const { plans } = planTeam(s, 'B', ['B1', 'B2', 'BGK']);
        out.push(plans.B1.action);
      }
      return count(out);
    };
    const before = decide(0);
    const after = decide(20);
    expect(before.bote ?? 0).toBeGreaterThan(before.conter ?? 0);
    expect(after.conter ?? 0).toBeGreaterThan(before.conter ?? 0);
    expect(after.conter ?? 0).toBeGreaterThan(after.bote ?? 0);
  });

  it('goleiro bot escolhe a zona pelo histórico do chutador', () => {
    const zones: number[] = [];
    for (let t = 20; t < 60; t++) {
      const s = withTurn(place(base2v2(), { A1: { x: 7, y: 3 }, A2: { x: 2, y: 6 }, B1: { x: 5, y: 0 }, B2: { x: 9, y: 0 } }, 'A1'), t);
      for (let h = 1; h <= 8; h++)
        s.history.push({ turn: h, plans: [{ playerId: 'A1', action: 'chutar', from: { x: 7, y: 3 }, dest: { x: 7, y: 3 }, shotZone: 5, context: 'carrier', hadBall: true }], events: [] });
      const { plans } = planTeam(s, 'B', ['B1', 'B2', 'BGK']);
      zones.push(plans.BGK.keeperZone ?? -1);
    }
    const c = count(zones.map(String));
    expect(c['5'] ?? 0).toBeGreaterThanOrEqual(20);
  });

  it('nunca chuta do próprio campo', () => {
    for (let t = 1; t <= 30; t++) {
      const s = withTurn(place(base2v2('novato'), { A1: { x: 2, y: 3 }, A2: { x: 1, y: 5 }, B1: { x: 8, y: 3 }, B2: { x: 9, y: 1 } }, 'A1'), t);
      const { plans } = planTeam(s, 'A', ['A1', 'A2', 'AGK']);
      expect(plans.A1.action).not.toBe('chutar');
    }
  });

  it('AFK não gasta o Flow do jogador', () => {
    for (let t = 1; t <= 20; t++) {
      const s = withTurn(place(base2v2(), { A1: { x: 7, y: 3 }, A2: { x: 8, y: 1 }, B1: { x: 9, y: 5 }, B2: { x: 9, y: 1 } }, 'A1'), t);
      s.players.A1.flow = 100;
      const { plans } = planTeam(s, 'A', ['A1'], { A1: { difficulty: 'regular', personality: 'cauteloso', noFlow: true } });
      expect(plans.A1.useFlow ?? false).toBe(false);
    }
  });

  it('cada decisão leva menos de 200 ms', () => {
    const s = makeMatch('5v5', [
      ...['A1', 'A2', 'A3', 'A4', 'A5'].map((id) => slot({ id, team: 'A', isBot: true, difficulty: 'chefe', lineageId: 'isagi', nodes: 'all' })),
      slot({ id: 'AGK', team: 'A', isKeeper: true, isBot: true }),
      ...['B1', 'B2', 'B3', 'B4', 'B5'].map((id) => slot({ id, team: 'B', isBot: true, difficulty: 'chefe', lineageId: 'lavinho', nodes: 'all' })),
      slot({ id: 'BGK', team: 'B', isKeeper: true, isBot: true }),
    ]);
    const out = autoTurn(s, { botIds: s.order });
    for (const d of out.debug) for (const b of d.bots) expect(b.ms).toBeLessThan(200);
  });

  it('a IA não lê o planejamento secreto: o plano do bot não muda com o plano humano', () => {
    const s = place(base2v2(), { A1: { x: 4, y: 3 }, A2: { x: 7, y: 2 }, B1: { x: 5, y: 3 }, B2: { x: 1, y: 6 } }, 'A1');
    const a = planTeam(s, 'B', ['B1', 'B2', 'BGK']).plans;
    // o humano (A1) escolhe coisas diferentes; planTeam nem recebe esses planos
    const humanPlans: PlanMap[] = [{ A1: plan('A1', { x: 6, y: 3 }, 'driblar') }, { A1: plan('A1', { x: 4, y: 3 }, 'passe_pe', { targetPlayer: 'A2' }) }];
    for (const hp of humanPlans) {
      const out = autoTurn(s, { humanPlans: hp, botIds: ['B1', 'B2', 'BGK', 'A2', 'AGK'] });
      expect(out.finalPlans.B1.action).toBe(a.B1.action);
      expect(out.finalPlans.B1.dest).toEqual(a.B1.dest);
    }
  });
});

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

function duelMatch(seed: string, a: Difficulty, b: Difficulty, lineage = 'isagi', mode: '1v1' | '2v2' = '1v1') {
  const n = mode === '1v1' ? 1 : 2;
  const slots: SlotSetup[] = [];
  for (const [team, diff] of [['A', a], ['B', b]] as [Team, Difficulty][]) {
    for (let i = 0; i < n; i++)
      slots.push(botSlot({ name: `${team}${i}`, lineageId: i === 0 ? lineage : 'kuon', level: 20, personality: 'coletivo', position: i === 0 ? 'atacante' : 'meio' }, `${team}${i + 1}`, team, diff));
    slots.push(keeperSlot(`${team}GK`, team, 20, 'regular'));
  }
  let s = createMatch(buildSetup({ id: seed, seed, mode, kind: 'simulacao', slots }));
  while (!s.finished) s = autoTurn(s, { botIds: slots.map((x) => x.id) }).result.state;
  return s;
}

function tournament(a: Difficulty, b: Difficulty, n: number, mode: '1v1' | '2v2' = '1v1') {
  let aw = 0;
  let bw = 0;
  let aGoals = 0;
  let bGoals = 0;
  const lineages = ['isagi', 'chigiri', 'lavinho', 'gagamaru', 'kuon'];
  for (let i = 0; i < n; i++) {
    const lineage = lineages[i % lineages.length];
    // alterna os lados para não favorecer quem sai jogando
    const flip = i % 2 === 1;
    const s = flip ? duelMatch(`t${a}${b}${i}`, b, a, lineage, mode) : duelMatch(`t${a}${b}${i}`, a, b, lineage, mode);
    const aTeam: Team = flip ? 'B' : 'A';
    const bTeam: Team = flip ? 'A' : 'B';
    aGoals += s.score[aTeam];
    bGoals += s.score[bTeam];
    if (s.winner === aTeam) aw++;
    else if (s.winner === bTeam) bw++;
  }
  return { aw, bw, aGoals, bGoals };
}

describe('IA: testes de simulação', () => {
  it('Elite vence Regular na maior parte das partidas decididas', () => {
    const r = tournament('elite', 'regular', 200, '2v2');
    expect(r.aw).toBeGreaterThan(r.bw);
    expect(r.aw / (r.aw + r.bw)).toBeGreaterThan(0.6);
    expect(r.aGoals).toBeGreaterThan(r.bGoals);
  });

  it('Chefe vence Elite', () => {
    const r = tournament('chefe', 'elite', 300, '1v1');
    expect(r.aw).toBeGreaterThan(r.bw);
    expect(r.aGoals).toBeGreaterThan(r.bGoals);
  });

  it('jogador roteirizado que repete sempre a mesma escolha perde desempenho contra Elite', () => {
    // humano roteirizado: sempre chuta no mesmo canto (zona 0). O goleiro Elite lê o padrão.
    const early = { goals: 0, shots: 0 };
    const late = { goals: 0, shots: 0 };
    for (let m = 0; m < 120; m++) {
      const slots: SlotSetup[] = [
        slot({ id: 'A1', team: 'A', lineageId: 'isagi', attrs: { chute: 8, drible: 6, velocidade: 6 } }),
        keeperSlot('AGK', 'A', 10, 'regular'),
        botSlot({ name: 'Elite', lineageId: 'kuon', level: 4, personality: 'cauteloso', position: 'defensor' }, 'B1', 'B', 'elite'),
        keeperSlot('BGK', 'B', 10, 'elite'),
      ];
      let s = createMatch(buildSetup({ id: `sc${m}`, seed: `script-${m}`, mode: '1v1', kind: 'simulacao', slots, turnsPerHalf: 12 }));
      let shots = 0;
      while (!s.finished) {
        const human: PlanMap = {};
        const me = s.players.A1;
        if (s.ball.holder === 'A1') {
          const nearGoal = s.setup.field.width - 1 - me.pos.x <= 4;
          human.A1 = nearGoal
            ? plan('A1', me.pos, 'chutar', { shotZone: 0 })
            : plan('A1', { x: Math.min(s.setup.field.width - 1, me.pos.x + 2), y: 3 }, 'conduzir');
        }
        const out = autoTurn(s, { humanPlans: human, botIds: ['AGK', 'B1', 'BGK'], afkIds: human.A1 ? [] : ['A1'] });
        for (const e of out.result.events)
          if (e.t === 'shot' && e.shooter === 'A1' && !e.blockedBy) {
            const bucket = shots < 2 ? early : late;
            bucket.shots++;
            if (e.goal) bucket.goals++;
            shots++;
          }
        s = out.result.state;
      }
    }
    const rEarly = early.goals / Math.max(1, early.shots);
    const rLate = late.goals / Math.max(1, late.shots);
    expect(early.shots).toBeGreaterThan(20);
    expect(late.shots).toBeGreaterThan(20);
    expect(rLate).toBeLessThan(rEarly);
  });
});

