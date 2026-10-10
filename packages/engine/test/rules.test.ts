import { describe, expect, it } from 'vitest';
import { MATCH_RULES } from '@ego/content';
import {
  baseMoveRange,
  duelMatrix,
  goalRows,
  isInArea,
  resolveTurn,
  validatePlan,
  zonesAdjacent,
  type MatchState,
  type PlanMap,
} from '../src';
import { duelSetup, makeMatch, place, plan, slot } from '../src/testing';

const plans = (...ps: ReturnType<typeof plan>[]): PlanMap => Object.fromEntries(ps.map((p) => [p.playerId, p]));

function keepersStay(s: MatchState) {
  return [plan('AGK', s.players.AGK.pos, 'gk_posicionar', { keeperZone: 1 }), plan('BGK', s.players.BGK.pos, 'gk_posicionar', { keeperZone: 1 })];
}

describe('campo', () => {
  it('tamanhos por modo', () => {
    expect(makeMatch('1v1', [slot({ id: 'A1', team: 'A' }), slot({ id: 'B1', team: 'B' })]).setup.field).toEqual({ width: 11, height: 7 });
    expect(makeMatch('4v4', [slot({ id: 'A1', team: 'A' }), slot({ id: 'B1', team: 'B' })]).setup.field).toEqual({ width: 13, height: 8 });
    expect(makeMatch('5v5', [slot({ id: 'A1', team: 'A' }), slot({ id: 'B1', team: 'B' })]).setup.field).toEqual({ width: 15, height: 9 });
  });
  it('gol com 3 casas centrais e área de 2 colunas', () => {
    const f = { width: 11, height: 7 };
    expect(goalRows(f)).toEqual([2, 3, 4]);
    expect(isInArea({ x: 1, y: 3 }, 'A', f)).toBe(true);
    expect(isInArea({ x: 2, y: 3 }, 'A', f)).toBe(false);
    expect(isInArea({ x: 9, y: 1 }, 'B', f)).toBe(true);
    expect(isInArea({ x: 9, y: 0 }, 'B', f)).toBe(false);
  });
});

describe('determinismo', () => {
  it('mesma seed e mesmas entradas geram o mesmo resultado', () => {
    const run = (seed: string) => {
      let s = duelSetup({ attrs: { drible: 6 } }, { attrs: { defesa: 6 } }, seed);
      const out: unknown[] = [];
      for (let i = 0; i < 6 && !s.finished; i++) {
        const holder = s.ball.holder;
        const ps: PlanMap = plans(...keepersStay(s));
        for (const id of ['A1', 'B1']) {
          const p = s.players[id];
          const dir = p.team === 'A' ? 1 : -1;
          const dest = { x: Math.max(0, Math.min(10, p.pos.x + dir * 2)), y: p.pos.y };
          ps[id] = holder === id ? plan(id, dest, 'driblar') : plan(id, holder ? s.players[holder].pos : dest, 'bote');
        }
        const r = resolveTurn(s, ps);
        out.push(r.events, r.state.score, r.state.rng);
        s = r.state;
      }
      return JSON.stringify(out);
    };
    expect(run('abc')).toBe(run('abc'));
    expect(run('abc')).not.toBe(run('xyz'));
  });

  it('resolveTurn não altera o estado de entrada', () => {
    const s = duelSetup();
    const before = JSON.stringify(s);
    resolveTurn(s, plans(plan('A1', { x: 6, y: 3 }, 'conduzir'), ...keepersStay(s)));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('movimento', () => {
  it('alcance = 2 + floor(Velocidade/4)', () => {
    expect(baseMoveRange(duelSetup({ attrs: { velocidade: 3 } }), 'A1')).toBe(2);
    expect(baseMoveRange(duelSetup({ attrs: { velocidade: 4 } }), 'A1')).toBe(3);
    expect(baseMoveRange(duelSetup({ attrs: { velocidade: 8 } }), 'A1')).toBe(4);
  });

  it('destino fora do alcance é inválido; sprint amplia e custa fôlego', () => {
    const s = place(duelSetup({ attrs: { velocidade: 4 } }), { A1: { x: 2, y: 3 }, B1: { x: 9, y: 0 } }, 'A1');
    expect(validatePlan(s, plan('A1', { x: 7, y: 3 }, 'conduzir')).ok).toBe(false);
    expect(validatePlan(s, plan('A1', { x: 7, y: 3 }, 'conduzir', { sprint: true })).ok).toBe(true);
    const r = resolveTurn(s, plans(plan('A1', { x: 7, y: 3 }, 'conduzir', { sprint: true }), plan('B1', { x: 9, y: 0 }, 'mover'), ...keepersStay(s)));
    expect(r.state.players.A1.pos).toEqual({ x: 7, y: 3 });
    // 100 - 15 + 10 de recuperação (máximo 100)
    expect(r.state.players.A1.stamina).toBe(95);
  });

  it('todos andam ao mesmo tempo, 1 casa por passo', () => {
    const s = place(duelSetup(), { A1: { x: 2, y: 3 }, B1: { x: 8, y: 0 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 5, y: 3 }, 'conduzir'), plan('B1', { x: 8, y: 3 }, 'mover'), ...keepersStay(s)));
    // frame 0 = início, depois um frame por passo
    expect(r.frames[1].positions.A1).toEqual({ x: 3, y: 3 });
    expect(r.frames[1].positions.B1).toEqual({ x: 8, y: 1 });
    expect(r.frames[3].positions.A1).toEqual({ x: 5, y: 3 });
  });

  it('dois jogadores não ocupam a mesma casa', () => {
    const s = place(duelSetup(), { A1: { x: 4, y: 3 }, B1: { x: 6, y: 3 } }, null);
    s.ball.pos = { x: 0, y: 0 };
    const r = resolveTurn(s, plans(plan('A1', { x: 5, y: 3 }, 'mover'), plan('B1', { x: 5, y: 3 }, 'mover'), ...keepersStay(s)));
    expect(r.state.players.A1.pos).not.toEqual(r.state.players.B1.pos);
  });

  it('goleiro não sai da área', () => {
    const s = duelSetup();
    expect(validatePlan(s, plan('AGK', { x: 2, y: 3 }, 'gk_posicionar')).ok).toBe(false);
    expect(validatePlan(s, plan('AGK', { x: 1, y: 2 }, 'gk_posicionar')).ok).toBe(true);
  });
});

describe('zona de controle e duelos', () => {
  it('matriz de duelo', () => {
    const b = MATCH_RULES.duel.matrixBonus;
    expect(duelMatrix('driblar', 'bote')).toEqual([b, 0]);
    expect(duelMatrix('driblar', 'conter')).toEqual([0, b]);
    expect(duelMatrix('driblar', 'fechar_linha')).toEqual([b, 0]);
    expect(duelMatrix('proteger', 'bote')).toEqual([0, b]);
    expect(duelMatrix('proteger', 'conter')).toEqual([0, 0]);
    expect(duelMatrix('passe_pe', 'bote')).toEqual([b, 0]);
    expect(duelMatrix('passe_pe', 'conter')).toEqual([0, 0]);
  });

  it('conduzir para na borda da zona', () => {
    const s = place(duelSetup(), { A1: { x: 2, y: 3 }, B1: { x: 6, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 5, y: 3 }, 'conduzir'), plan('B1', { x: 6, y: 3 }, 'mover'), ...keepersStay(s)));
    expect(r.state.players.A1.pos).toEqual({ x: 4, y: 3 });
    expect(r.events.some((e) => e.t === 'duel')).toBe(false);
  });

  it('driblar atravessa a zona e gera duelo; vencendo, segue e ganha Flow', () => {
    const s = place(duelSetup({ attrs: { drible: 30 } }, { attrs: { defesa: 0 } }), { A1: { x: 3, y: 3 }, B1: { x: 5, y: 2 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 6, y: 3 }, 'driblar'), plan('B1', { x: 5, y: 2 }, 'mover'), ...keepersStay(s)));
    const duel = r.events.find((e) => e.t === 'duel');
    expect(duel && duel.t === 'duel' && duel.winner).toBe('atk');
    expect(r.state.players.A1.pos).toEqual({ x: 6, y: 3 });
    expect(r.state.ball.holder).toBe('A1');
    expect(r.state.players.A1.flow).toBe(MATCH_RULES.flow.dribbleWon);
    expect(r.state.players.A1.stats.dribblesWon).toBe(1);
  });

  it('perdendo o drible, perde a bola', () => {
    const s = place(duelSetup({ attrs: { drible: 0 } }, { attrs: { defesa: 30 } }), { A1: { x: 3, y: 3 }, B1: { x: 5, y: 2 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 6, y: 3 }, 'driblar'), plan('B1', { x: 5, y: 2 }, 'conter'), ...keepersStay(s)));
    expect(r.state.ball.holder).toBe('B1');
    expect(r.events.some((e) => e.t === 'steal')).toBe(true);
  });

  it('quem já começa na zona duela desde o início do lance', () => {
    const s = place(duelSetup({ attrs: { fisico: 0 } }, { attrs: { defesa: 30 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 4, y: 3 }, 'proteger'), plan('B1', { x: 5, y: 3 }, 'bote'), ...keepersStay(s)));
    const d = r.events.find((e) => e.t === 'duel');
    expect(d && d.t === 'duel' && d.step).toBe(0);
    expect(r.state.ball.holder).toBe('B1');
  });

  it('defensor que perde após Bote fica vendido e não se move no próximo lance', () => {
    let s = place(duelSetup({ attrs: { drible: 30 } }, { attrs: { defesa: 0 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    let r = resolveTurn(s, plans(plan('A1', { x: 6, y: 2 }, 'driblar'), plan('B1', { x: 5, y: 3 }, 'bote'), ...keepersStay(s)));
    expect(r.state.players.B1.statuses.some((x) => x.kind === 'vendido')).toBe(true);
    s = r.state;
    const b1 = { ...s.players.B1.pos };
    expect(validatePlan(s, plan('B1', { x: b1.x - 1, y: b1.y }, 'mover')).ok).toBe(false);
    r = resolveTurn(s, plans(plan('A1', s.players.A1.pos, 'proteger'), plan('B1', b1, 'mover'), ...keepersStay(s)));
    expect(r.state.players.B1.pos).toEqual(b1);
  });

  it('Proteger dá +2 para o portador', () => {
    const s = place(duelSetup({ attrs: { fisico: 5 } }, { attrs: { defesa: 5 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 4, y: 3 }, 'proteger'), plan('B1', { x: 5, y: 3 }, 'conter'), ...keepersStay(s)));
    const d = r.events.find((e) => e.t === 'duel');
    expect(d?.t).toBe('duel');
    if (d?.t === 'duel') {
      expect(d.kind).toBe('protecao');
      // físico 5 + d10 + 2 => 8..17
      expect(d.atk).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('passe', () => {
  it('passe no pé chega onde o aliado termina', () => {
    const s = makeMatch('2v2', [
      slot({ id: 'A1', team: 'A', attrs: { passe: 30 } }),
      slot({ id: 'A2', team: 'A' }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B' }),
      slot({ id: 'B2', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ]);
    place(s, { A1: { x: 3, y: 3 }, A2: { x: 4, y: 0 }, B1: { x: 9, y: 6 }, B2: { x: 8, y: 6 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(plan('A1', { x: 3, y: 3 }, 'passe_pe', { targetPlayer: 'A2' }), plan('A2', { x: 6, y: 0 }, 'mover'), plan('B1', { x: 9, y: 6 }, 'mover'), plan('B2', { x: 8, y: 6 }, 'mover'), ...keepersStay(s)),
    );
    expect(r.state.ball.holder).toBe('A2');
    expect(r.state.ball.pos).toEqual({ x: 6, y: 0 });
    expect(r.state.players.A1.stats.passesCompleted).toBe(1);
  });

  it('defensor com Fechar linha na linha intercepta passe fraco', () => {
    const s = makeMatch('2v2', [
      slot({ id: 'A1', team: 'A', attrs: { passe: 8 } }),
      slot({ id: 'A2', team: 'A' }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B', attrs: { defesa: 30 } }),
      slot({ id: 'B2', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ]);
    place(s, { A1: { x: 2, y: 3 }, A2: { x: 7, y: 3 }, B1: { x: 5, y: 4 }, B2: { x: 9, y: 6 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(plan('A1', { x: 2, y: 3 }, 'passe_pe', { targetPlayer: 'A2' }), plan('A2', { x: 7, y: 3 }, 'mover'), plan('B1', { x: 5, y: 4 }, 'fechar_linha'), plan('B2', { x: 9, y: 6 }, 'mover'), ...keepersStay(s)),
    );
    const ev = r.events.find((e) => e.t === 'pass');
    expect(ev?.t === 'pass' && ev.result).toBe('intercepted');
    expect(r.state.ball.holder).toBe('B1');
  });

  it('passe no espaço sem aliado perto deixa a bola solta', () => {
    const s = makeMatch('2v2', [
      slot({ id: 'A1', team: 'A', attrs: { passe: 30 } }),
      slot({ id: 'A2', team: 'A' }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B' }),
      slot({ id: 'B2', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ]);
    place(s, { A1: { x: 2, y: 3 }, A2: { x: 2, y: 0 }, B1: { x: 9, y: 6 }, B2: { x: 9, y: 0 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(plan('A1', { x: 2, y: 3 }, 'passe_espaco', { targetCell: { x: 6, y: 5 } }), plan('A2', { x: 2, y: 0 }, 'mover'), plan('B1', { x: 9, y: 6 }, 'mover'), plan('B2', { x: 9, y: 0 }, 'mover'), ...keepersStay(s)),
    );
    expect(r.state.ball.holder).toBeNull();
    expect(r.state.ball.pos).toEqual({ x: 6, y: 5 });
  });

  it('passe no espaço com aliado adjacente é recebido', () => {
    const s = makeMatch('2v2', [
      slot({ id: 'A1', team: 'A', attrs: { passe: 30 } }),
      slot({ id: 'A2', team: 'A' }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B' }),
      slot({ id: 'B2', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ]);
    place(s, { A1: { x: 2, y: 3 }, A2: { x: 4, y: 5 }, B1: { x: 9, y: 6 }, B2: { x: 9, y: 0 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(plan('A1', { x: 2, y: 3 }, 'passe_espaco', { targetCell: { x: 6, y: 5 } }), plan('A2', { x: 5, y: 5 }, 'desmarque'), plan('B1', { x: 9, y: 6 }, 'mover'), plan('B2', { x: 9, y: 0 }, 'mover'), ...keepersStay(s)),
    );
    expect(r.state.ball.holder).toBe('A2');
  });

  it('tabela: a bola vai e volta', () => {
    const s = makeMatch('2v2', [
      slot({ id: 'A1', team: 'A', attrs: { passe: 30 } }),
      slot({ id: 'A2', team: 'A', attrs: { passe: 30 } }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B' }),
      slot({ id: 'B2', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ]);
    place(s, { A1: { x: 3, y: 3 }, A2: { x: 4, y: 2 }, B1: { x: 9, y: 6 }, B2: { x: 9, y: 0 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(plan('A1', { x: 5, y: 3 }, 'tabela', { targetPlayer: 'A2' }), plan('A2', { x: 4, y: 2 }, 'tabela', { targetPlayer: 'A1' }), plan('B1', { x: 9, y: 6 }, 'mover'), plan('B2', { x: 9, y: 0 }, 'mover'), ...keepersStay(s)),
    );
    expect(r.state.ball.holder).toBe('A1');
    expect(r.state.players.A1.stats.tabelas).toBe(1);
  });
});

describe('chute e goleiro', () => {
  it('zonas vizinhas do gol', () => {
    expect(zonesAdjacent(0, 1)).toBe(true);
    expect(zonesAdjacent(0, 3)).toBe(true);
    expect(zonesAdjacent(0, 4)).toBe(false);
    expect(zonesAdjacent(1, 2)).toBe(true);
  });

  it('chute forte vence o goleiro: gol, Flow e reinício com a posse de quem sofreu', () => {
    const s = place(duelSetup({ attrs: { chute: 40 } }), { A1: { x: 8, y: 3 }, B1: { x: 5, y: 0 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 8, y: 3 }, 'chutar', { shotZone: 0 }), plan('B1', { x: 5, y: 0 }, 'mover'), ...keepersStay(s)));
    expect(r.goal).toBe('A');
    expect(r.state.score.A).toBe(1);
    expect(r.state.players.A1.flow).toBe(MATCH_RULES.flow.goal);
    expect(r.state.ball.holder).toBe('B1');
    expect(r.state.players.B1.pos).toEqual({ x: 5, y: 3 });
  });

  it('goleiro forte defende e fica com a bola', () => {
    const s = makeMatch('1v1', [
      slot({ id: 'A1', team: 'A', attrs: { chute: 0 } }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true, attrs: { fisico: 40, visao: 40 } }),
    ]);
    place(s, { A1: { x: 8, y: 3 }, B1: { x: 5, y: 0 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 8, y: 3 }, 'chutar', { shotZone: 0 }), plan('B1', { x: 5, y: 0 }, 'mover'), ...keepersStay(s)));
    expect(r.goal).toBeNull();
    expect(r.state.ball.holder).toBe('BGK');
    expect(r.state.players.BGK.flow).toBe(MATCH_RULES.flow.goalkeeperSave);
  });

  it('zona certa do goleiro dá +4', () => {
    const s = place(duelSetup({ attrs: { chute: 5 } }), { A1: { x: 8, y: 3 }, B1: { x: 5, y: 0 } }, 'A1');
    const ks = keepersStay(s);
    ks[1].keeperZone = 2;
    const r = resolveTurn(s, plans(plan('A1', { x: 8, y: 3 }, 'chutar', { shotZone: 2 }), plan('B1', { x: 5, y: 0 }, 'mover'), ...ks));
    const shot = r.events.find((e) => e.t === 'shot');
    // goleiro: floor((5+5)/2)=5 + d10 + 4 => 10..19
    expect(shot?.t === 'shot' && shot.keeperRoll).toBeGreaterThanOrEqual(10);
  });

  it('defensor na linha do chute tira 2', () => {
    const s = place(duelSetup({ attrs: { chute: 5 } }), { A1: { x: 6, y: 3 }, B1: { x: 8, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 6, y: 3 }, 'chutar', { shotZone: 1 }), plan('B1', { x: 8, y: 3 }, 'mover'), ...keepersStay(s)));
    const shot = r.events.find((e) => e.t === 'shot');
    // 5 + d10 - 2 (defensor) => no máximo 13
    expect(shot?.t === 'shot' && shot.roll).toBeLessThanOrEqual(13);
  });
});

describe('fôlego e flow', () => {
  it('Bote custa 5 e fôlego recupera 10 por lance', () => {
    const s = place(duelSetup(), { A1: { x: 2, y: 3 }, B1: { x: 8, y: 3 } }, 'A1');
    s.players.B1.stamina = 50;
    const r = resolveTurn(s, plans(plan('A1', { x: 2, y: 3 }, 'proteger'), plan('B1', { x: 7, y: 3 }, 'bote'), ...keepersStay(s)));
    expect(r.state.players.B1.stamina).toBe(55);
  });

  it('fôlego abaixo de 20 dá -1 em tudo', () => {
    const s = place(duelSetup({ attrs: { fisico: 5 } }, { attrs: { defesa: 5 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    s.players.A1.stamina = 10;
    const r = resolveTurn(s, plans(plan('A1', { x: 4, y: 3 }, 'proteger'), plan('B1', { x: 5, y: 3 }, 'conter'), ...keepersStay(s)));
    const d = r.events.find((e) => e.t === 'duel');
    // 5 + d10 + 2 (proteger) - 1 => 7..16
    expect(d?.t === 'duel' && d.atk).toBeLessThanOrEqual(16);
  });

  it('Flow em 100 libera a habilidade de Flow e zera', () => {
    const s = place(duelSetup({ lineageId: 'kuon' }), { A1: { x: 2, y: 3 }, B1: { x: 8, y: 3 } }, 'A1');
    s.players.A1.flow = 100;
    s.players.A1.stamina = 30;
    const r = resolveTurn(s, plans(plan('A1', { x: 2, y: 3 }, 'proteger', { useFlow: true }), plan('B1', { x: 8, y: 3 }, 'mover'), ...keepersStay(s)));
    expect(r.state.players.A1.flow).toBe(0);
    expect(r.state.players.A1.stamina).toBe(100);
    expect(r.events.some((e) => e.t === 'flow')).toBe(true);
    expect(r.state.players.A1.statuses.some((x) => x.kind === 'all_plus')).toBe(true);
  });
});

describe('Leitura', () => {
  it('Leitura certa perto do portador dá +25 de Flow', () => {
    const s = place(duelSetup(), { A1: { x: 3, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 3, y: 3 }, 'proteger'), plan('B1', { x: 5, y: 3 }, 'leitura', { readGuess: 'proteger' }), ...keepersStay(s)));
    expect(r.state.players.B1.flow).toBe(MATCH_RULES.flow.readCorrect);
    expect(r.state.players.B1.stats.readsCorrect).toBe(1);
  });
  it('Leitura errada dá -1 de iniciativa no próximo lance', () => {
    const s = place(duelSetup(), { A1: { x: 3, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 3, y: 3 }, 'proteger'), plan('B1', { x: 5, y: 3 }, 'leitura', { readGuess: 'chute' }), ...keepersStay(s)));
    expect(r.state.players.B1.statuses.some((x) => x.kind === 'read_wrong')).toBe(true);
  });
});

describe('tempo e reinícios', () => {
  it('dois tempos de N lances e fim de partida', () => {
    let s = makeMatch('1v1', [slot({ id: 'A1', team: 'A' }), slot({ id: 'AGK', team: 'A', isKeeper: true }), slot({ id: 'B1', team: 'B' }), slot({ id: 'BGK', team: 'B', isKeeper: true })], 't', {
      turnsPerHalf: 2,
      halves: 2,
    });
    let halftime = false;
    for (let i = 0; i < 4; i++) {
      const r = resolveTurn(s, {});
      if (r.events.some((e) => e.t === 'halftime')) halftime = true;
      s = r.state;
    }
    expect(halftime).toBe(true);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe('draw');
  });

  it('bola que sai do campo vai para o adversário na borda', () => {
    const s = makeMatch('2v2', [
      slot({ id: 'A1', team: 'A', attrs: { passe: -20 } }),
      slot({ id: 'A2', team: 'A' }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B' }),
      slot({ id: 'B2', team: 'B' }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ]);
    place(s, { A1: { x: 3, y: 1 }, A2: { x: 5, y: 0 }, B1: { x: 9, y: 6 }, B2: { x: 9, y: 5 } }, 'A1');
    let out = false;
    for (let i = 0; i < 20 && !out; i++) {
      const s2 = { ...s, rng: [i + 1, i + 7, i + 13, i + 21] as [number, number, number, number] };
      const r = resolveTurn(s2, plans(plan('A1', { x: 3, y: 1 }, 'passe_pe', { targetPlayer: 'A2' }), plan('A2', { x: 5, y: 0 }, 'mover'), plan('B1', { x: 9, y: 6 }, 'mover'), plan('B2', { x: 9, y: 5 }, 'mover'), ...keepersStay(s2)));
      const ev = r.events.find((e) => e.t === 'out');
      if (ev && ev.t === 'out') {
        out = true;
        expect(r.state.players[r.state.ball.holder!].team).toBe('B');
      }
    }
    expect(out).toBe(true);
  });

  it('partida rápida: primeiro a N gols encerra', () => {
    const s = makeMatch('1v1', [slot({ id: 'A1', team: 'A', attrs: { chute: 40 } }), slot({ id: 'AGK', team: 'A', isKeeper: true }), slot({ id: 'B1', team: 'B' }), slot({ id: 'BGK', team: 'B', isKeeper: true })], 'q', {
      firstTo: 1,
    });
    place(s, { A1: { x: 8, y: 3 }, B1: { x: 5, y: 0 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 8, y: 3 }, 'chutar', { shotZone: 0 }), ...keepersStay(s)));
    expect(r.state.finished).toBe(true);
    expect(r.state.winner).toBe('A');
  });
});
