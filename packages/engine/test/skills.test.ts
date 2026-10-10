import { describe, expect, it } from 'vitest';
import {
  applyReaction,
  getReactionRequests,
  planMoveRange,
  resolveTurn,
  skillOptions,
  validatePlan,
  zoneRadius,
  type MatchState,
  type PlanMap,
} from '../src';
import { duelSetup, makeMatch, place, plan, slot } from '../src/testing';

const plans = (...ps: ReturnType<typeof plan>[]): PlanMap => Object.fromEntries(ps.map((p) => [p.playerId, p]));
const gk = (s: MatchState) => [plan('AGK', s.players.AGK.pos, 'gk_posicionar', { keeperZone: 1 }), plan('BGK', s.players.BGK.pos, 'gk_posicionar', { keeperZone: 1 })];

function twoVtwo(a1: Parameters<typeof slot>[0], a2: Partial<Parameters<typeof slot>[0]> = {}, b1: Partial<Parameters<typeof slot>[0]> = {}, b2: Partial<Parameters<typeof slot>[0]> = {}) {
  return makeMatch('2v2', [
    slot(a1),
    slot({ id: 'A2', team: 'A', ...a2 }),
    slot({ id: 'AGK', team: 'A', isKeeper: true }),
    slot({ id: 'B1', team: 'B', ...b1 }),
    slot({ id: 'B2', team: 'B', ...b2 }),
    slot({ id: 'BGK', team: 'B', isKeeper: true }),
  ]);
}

describe('Kuon', () => {
  it('Arrancada: +2 casas, custo 20; Arrancada II custa 10', () => {
    const s = place(duelSetup({ lineageId: 'kuon', nodes: ['kuon_arrancada'], attrs: { velocidade: 4 } }), { A1: { x: 2, y: 3 }, B1: { x: 9, y: 0 } }, 'A1');
    expect(planMoveRange(s, 'A1', { skill: 'arrancada' })).toBe(5);
    expect(skillOptions(s, 'A1').find((o) => o.skillId === 'arrancada')?.stamina).toBe(20);
    const s2 = duelSetup({ lineageId: 'kuon', nodes: 'all' });
    expect(skillOptions(s2, 'A1').find((o) => o.skillId === 'arrancada')?.stamina).toBe(10);
    const r = resolveTurn(s, plans(plan('A1', { x: 7, y: 3 }, 'conduzir', { skill: 'arrancada' }), plan('B1', { x: 9, y: 0 }, 'mover'), ...gk(s)));
    expect(r.state.players.A1.pos).toEqual({ x: 7, y: 3 });
    expect(r.state.players.A1.cooldowns.arrancada).toBe(1 + 2 + 1);
  });

  it('Carrinho: +2 no bote; se falhar, fica caído', () => {
    const s = place(duelSetup({ attrs: { drible: 40 } }, { lineageId: 'kuon', nodes: ['kuon_arrancada', 'kuon_carrinho'], attrs: { defesa: 0 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 6, y: 2 }, 'driblar'), plan('B1', { x: 5, y: 3 }, 'bote', { skill: 'carrinho' }), ...gk(s)));
    expect(r.state.players.B1.statuses.some((x) => x.kind === 'caido')).toBe(true);
  });

  it('Cobertura: Kuon disputa a bola quando o aliado perde', () => {
    const s = twoVtwo({ id: 'A1', team: 'A', attrs: { drible: 12 } }, {}, { attrs: { defesa: -20 } }, { lineageId: 'kuon', nodes: 'all', attrs: { defesa: 40 } });
    place(s, { A1: { x: 4, y: 3 }, A2: { x: 1, y: 6 }, B1: { x: 5, y: 3 }, B2: { x: 6, y: 5 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(
        plan('A1', { x: 6, y: 1 }, 'driblar'),
        plan('A2', { x: 1, y: 6 }, 'mover'),
        plan('B1', { x: 5, y: 3 }, 'bote'),
        plan('B2', { x: 6, y: 5 }, 'mover', { skill: 'cobertura', skillTarget: 'B1' }),
        ...gk(s),
      ),
    );
    expect(r.events.some((e) => e.t === 'duel' && e.kind === 'cobertura')).toBe(true);
    expect(r.state.ball.holder).toBe('B2');
  });
});

describe('Gagamaru', () => {
  it('Muralha Viva: zona de raio 2 por 2 lances', () => {
    const s = place(duelSetup({}, { lineageId: 'gagamaru' }), { A1: { x: 2, y: 3 }, B1: { x: 8, y: 3 } }, 'A1');
    s.players.B1.flow = 100;
    const r = resolveTurn(s, plans(plan('A1', { x: 2, y: 3 }, 'proteger'), plan('B1', { x: 8, y: 3 }, 'conter', { useFlow: true }), ...gk(s)));
    expect(zoneRadius(r.state, 'B1')).toBe(2);
    const r2 = resolveTurn(r.state, {});
    expect(zoneRadius(r2.state, 'B1')).toBe(1);
  });

  it('Corpo Elástico bloqueia o chute', () => {
    const s = place(duelSetup({ attrs: { chute: 0 } }, { lineageId: 'gagamaru', nodes: ['gagamaru_corpo'], attrs: { fisico: 40 } }), { A1: { x: 6, y: 3 }, B1: { x: 8, y: 5 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 6, y: 3 }, 'chutar', { shotZone: 1 }), plan('B1', { x: 8, y: 5 }, 'mover', { skill: 'corpo_elastico' }), ...gk(s)));
    expect(r.events.some((e) => e.t === 'block')).toBe(true);
    expect(r.state.ball.holder).toBe('B1');
    expect(r.state.players.B1.stats.skillUses.corpo_elastico).toBe(1);
  });

  it('Instinto Animal revela a ação do portador e permite refazer o plano', () => {
    const s = place(duelSetup({}, { lineageId: 'gagamaru', nodes: ['gagamaru_instinto'] }), { A1: { x: 3, y: 3 }, B1: { x: 6, y: 3 } }, 'A1');
    const ps = plans(plan('A1', { x: 5, y: 3 }, 'driblar'), plan('B1', { x: 6, y: 3 }, 'bote', { skill: 'instinto_animal' }), ...gk(s));
    const reqs = getReactionRequests(s, ps);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].revealed[0]).toMatchObject({ playerId: 'A1', action: 'driblar' });
    expect(reqs[0].revealed[0].dest).toBeUndefined();
    const out = applyReaction(s, ps, reqs[0], { action: 'conter' });
    expect(out.plans.B1.action).toBe('conter');
  });

  it('Salto Imprevisível ignora zonas', () => {
    const s = place(duelSetup({ lineageId: 'gagamaru', nodes: 'all', attrs: { velocidade: 3 } }, { attrs: { defesa: 40 } }), { A1: { x: 3, y: 3 }, B1: { x: 5, y: 2 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 6, y: 3 }, 'conduzir', { skill: 'salto_imprevisivel' }), plan('B1', { x: 5, y: 2 }, 'mover'), ...gk(s)));
    expect(r.state.players.A1.pos).toEqual({ x: 6, y: 3 });
    expect(r.events.some((e) => e.t === 'duel')).toBe(false);
  });
});

describe('Chigiri', () => {
  it('Pantera Vermelha: dobro do movimento', () => {
    const s = duelSetup({ lineageId: 'chigiri', attrs: { velocidade: 8 } });
    s.players.A1.flow = 100;
    expect(planMoveRange(s, 'A1', { useFlow: true })).toBe(8);
  });

  it('Faixa de Aceleração: 4+ casas em linha reta, trilha protege o passe', () => {
    const s = twoVtwo(
      { id: 'A1', team: 'A', attrs: { passe: 3 } },
      { lineageId: 'chigiri', nodes: ['chigiri_faixa'], attrs: { velocidade: 10 } },
      { attrs: { defesa: 40 } },
      {},
    );
    place(s, { A1: { x: 2, y: 3 }, A2: { x: 2, y: 0 }, B1: { x: 4, y: 1 }, B2: { x: 9, y: 6 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(
        plan('A1', { x: 2, y: 3 }, 'passe_pe', { targetPlayer: 'A2' }),
        plan('A2', { x: 6, y: 0 }, 'mover', { skill: 'faixa_aceleracao' }),
        plan('B1', { x: 4, y: 1 }, 'fechar_linha'),
        plan('B2', { x: 9, y: 6 }, 'mover'),
        ...gk(s),
      ),
    );
    expect(r.state.trails.length + (r.events.some((e) => e.t === 'skill' && e.skillId === 'faixa_aceleracao' && e.success) ? 1 : 0)).toBeGreaterThan(0);
    const pass = r.events.find((e) => e.t === 'pass');
    expect(pass?.t === 'pass' && pass.result).not.toBe('intercepted');
  });

  it('Chute em Velocidade: bônus pelas casas percorridas', () => {
    const s = place(duelSetup({ lineageId: 'chigiri', nodes: ['chigiri_chute'], attrs: { velocidade: 10, chute: 5 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 0 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 8, y: 3 }, 'chutar', { skill: 'chute_velocidade', shotZone: 0 }), plan('B1', { x: 5, y: 0 }, 'mover'), ...gk(s)));
    const shot = r.events.find((e) => e.t === 'shot');
    // 5 + d10 + 4 => pelo menos 10
    expect(shot?.t === 'shot' && shot.roll).toBeGreaterThanOrEqual(10);
    expect(r.state.players.A1.stats.skillUses.chute_velocidade).toBe(1);
  });

  it('Arranque Tardio: escolhe o destino depois, com metade do movimento', () => {
    const s = place(duelSetup({ lineageId: 'chigiri', nodes: ['chigiri_arranque'], attrs: { velocidade: 8 } }), { A1: { x: 3, y: 3 }, B1: { x: 8, y: 3 } }, null);
    expect(planMoveRange(s, 'A1', { skill: 'arranque_tardio' })).toBe(2);
    const ps = plans(plan('A1', { x: 3, y: 3 }, 'mover', { skill: 'arranque_tardio' }), plan('B1', { x: 6, y: 3 }, 'mover'), ...gk(s));
    const req = getReactionRequests(s, ps).find((r) => r.playerId === 'A1')!;
    expect(req.lateMove).toBe(true);
    expect(req.revealed.find((x) => x.playerId === 'B1')?.dest).toEqual({ x: 6, y: 3 });
    const out = applyReaction(s, ps, req, { dest: { x: 5, y: 2 } });
    expect(out.error).toBeUndefined();
  });
});

describe('Isagi', () => {
  it('Chute Direto: recebe e chuta no mesmo lance com +3', () => {
    const s = twoVtwo({ id: 'A1', team: 'A', attrs: { passe: 40 } }, { lineageId: 'isagi', nodes: ['isagi_chute_direto'], attrs: { chute: 5 } });
    place(s, { A1: { x: 5, y: 3 }, A2: { x: 7, y: 2 }, B1: { x: 1, y: 6 }, B2: { x: 2, y: 6 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(
        plan('A1', { x: 5, y: 3 }, 'passe_pe', { targetPlayer: 'A2' }),
        plan('A2', { x: 8, y: 2 }, 'finalizar_primeira', { skill: 'chute_direto', shotZone: 5 }),
        plan('B1', { x: 1, y: 6 }, 'mover'),
        plan('B2', { x: 2, y: 6 }, 'mover'),
        ...gk(s),
      ),
    );
    const shot = r.events.find((e) => e.t === 'shot');
    expect(shot?.t === 'shot' && shot.oneTouch).toBe(true);
    expect(shot?.t === 'shot' && shot.roll).toBeGreaterThanOrEqual(9);
  });

  it('Metavisão revela 2 adversários (3 com Metavisão II)', () => {
    const mk = (nodes: string[]) => {
      const s = makeMatch('3v3', [
        slot({ id: 'A1', team: 'A', lineageId: 'isagi', nodes }),
        slot({ id: 'A2', team: 'A' }),
        slot({ id: 'A3', team: 'A' }),
        slot({ id: 'AGK', team: 'A', isKeeper: true }),
        slot({ id: 'B1', team: 'B' }),
        slot({ id: 'B2', team: 'B' }),
        slot({ id: 'B3', team: 'B' }),
        slot({ id: 'BGK', team: 'B', isKeeper: true }),
      ]);
      return getReactionRequests(s, { A1: plan('A1', s.players.A1.pos, 'mover', { skill: 'metavisao' }) });
    };
    expect(mk(['isagi_leitura', 'isagi_metavisao'])[0].revealed).toHaveLength(2);
    expect(mk(['isagi_leitura', 'isagi_metavisao', 'isagi_metavisao_2'])[0].revealed).toHaveLength(3);
  });

  it('Peça que Encaixa: +6 e goleiro sem zona', () => {
    const s = twoVtwo({ id: 'A1', team: 'A', attrs: { passe: 40 } }, { lineageId: 'isagi', nodes: 'all', attrs: { chute: 5 } }, {}, {});
    place(s, { A1: { x: 5, y: 3 }, A2: { x: 7, y: 2 }, B1: { x: 1, y: 6 }, B2: { x: 2, y: 6 } }, 'A1');
    s.players.A2.flow = 100;
    const slotA2 = s.setup.slots.find((x) => x.id === 'A2')!;
    slotA2.loadout.flow = 'peca_que_encaixa';
    const r = resolveTurn(
      s,
      plans(
        plan('A1', { x: 5, y: 3 }, 'passe_pe', { targetPlayer: 'A2' }),
        plan('A2', { x: 8, y: 3 }, 'finalizar_primeira', { useFlow: true, shotZone: 1 }),
        plan('B1', { x: 1, y: 6 }, 'mover'),
        plan('B2', { x: 2, y: 6 }, 'mover'),
        ...gk(s),
      ),
    );
    const shot = r.events.find((e) => e.t === 'shot');
    expect(shot?.t === 'shot' && shot.keeperZone).toBeNull();
    expect(shot?.t === 'shot' && shot.roll).toBeGreaterThanOrEqual(12);
  });

  it('Devorar copia a última habilidade do adversário que duelou com Isagi', () => {
    let s = place(duelSetup({ lineageId: 'isagi', nodes: 'all', attrs: { drible: 40 } }, { lineageId: 'kuon', nodes: ['kuon_arrancada', 'kuon_carrinho'], attrs: { defesa: 0 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    s.setup.slots.find((x) => x.id === 'A1')!.loadout.active = ['devorar', 'chute_direto', 'metavisao'];
    let r = resolveTurn(s, plans(plan('A1', { x: 6, y: 2 }, 'driblar'), plan('B1', { x: 5, y: 3 }, 'bote', { skill: 'carrinho' }), ...gk(s)));
    s = r.state;
    const opt = skillOptions(s, 'A1').find((o) => o.skillId === 'devorar');
    expect(opt?.usable).toBe(false); // carrinho exige estar defendendo
    // copiando uma habilidade utilizável: Arrancada
    s = place(duelSetup({ lineageId: 'isagi', nodes: 'all', attrs: { drible: 40 } }, { lineageId: 'kuon', nodes: ['kuon_arrancada'], attrs: { defesa: 0 } }), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1');
    s.setup.slots.find((x) => x.id === 'A1')!.loadout.active = ['devorar', 'chute_direto', 'metavisao'];
    r = resolveTurn(s, plans(plan('A1', { x: 6, y: 2 }, 'driblar'), plan('B1', { x: 5, y: 3 }, 'bote', { skill: 'arrancada' }), ...gk(s)));
    s = r.state;
    expect(skillOptions(s, 'A1').find((o) => o.skillId === 'devorar')?.usable).toBe(true);
    expect(planMoveRange(s, 'A1', { skill: 'devorar' })).toBeGreaterThan(planMoveRange(s, 'A1', {}));
  });
});

describe('Lavinho', () => {
  it('Ritmo de Ginga: dribles acumulam; com 3, a próxima ação não sofre desarme', () => {
    let s = place(duelSetup({ lineageId: 'lavinho', nodes: ['lavinho_ritmo'], attrs: { drible: 40 } }, { attrs: { defesa: 0 } }), { A1: { x: 2, y: 3 }, B1: { x: 4, y: 3 } }, 'A1');
    const r = resolveTurn(s, plans(plan('A1', { x: 5, y: 3 }, 'driblar', { skill: 'ritmo_ginga' }), plan('B1', { x: 4, y: 3 }, 'conter'), ...gk(s)));
    expect(r.state.players.A1.rhythm).toBe(1);
    s = r.state;
    s.players.A1.rhythm = 3;
    s.setup.slots.find((x) => x.id === 'A1')!.attrs.drible = -50;
    s.setup.slots.find((x) => x.id === 'B1')!.attrs.defesa = 50;
    place(s, { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 } }, 'A1');
    const r2 = resolveTurn(s, plans(plan('A1', { x: 7, y: 2 }, 'driblar'), plan('B1', { x: 6, y: 3 }, 'bote'), ...gk(s)));
    expect(r2.events.some((e) => e.t === 'duel')).toBe(false);
    expect(r2.state.ball.holder).toBe('A1');
    expect(r2.state.players.A1.rhythm).toBe(0);
  });

  it('Ginga Perfeita: vê o plano de todos os adversários e refaz o seu', () => {
    const s = place(duelSetup({ lineageId: 'lavinho' }), { A1: { x: 3, y: 3 }, B1: { x: 6, y: 3 } }, 'A1');
    s.players.A1.flow = 100;
    const ps = plans(plan('A1', { x: 5, y: 3 }, 'driblar', { useFlow: true }), plan('B1', { x: 5, y: 3 }, 'conter'), ...gk(s));
    const req = getReactionRequests(s, ps).find((r) => r.playerId === 'A1')!;
    expect(req.revealed.map((x) => x.playerId).sort()).toEqual(['B1', 'BGK']);
    const out = applyReaction(s, ps, req, { action: 'conduzir', dest: { x: 4, y: 1 } });
    expect(out.plans.A1.action).toBe('conduzir');
    const r = resolveTurn(s, out.plans);
    expect(r.state.players.A1.rhythm).toBe(3);
  });

  it('Improviso troca só a ação de bola', () => {
    const s = place(duelSetup({ lineageId: 'lavinho', nodes: ['lavinho_improviso'] }), { A1: { x: 3, y: 3 }, B1: { x: 6, y: 3 } }, 'A1');
    const ps = plans(plan('A1', { x: 5, y: 3 }, 'driblar', { skill: 'improviso' }), plan('B1', { x: 5, y: 3 }, 'leitura', { readGuess: 'drible' }), ...gk(s));
    const req = getReactionRequests(s, ps).find((r) => r.playerId === 'A1')!;
    expect(req.ballActionOnly).toBe(true);
    expect(req.allowDest).toBe(false);
    const out = applyReaction(s, ps, req, { action: 'conduzir', dest: { x: 0, y: 0 } });
    expect(out.plans.A1.action).toBe('conduzir');
    expect(out.plans.A1.dest).toEqual({ x: 5, y: 3 });
  });

  it('Passe em Curva: o primeiro defensor na linha não intercepta', () => {
    const s = twoVtwo({ id: 'A1', team: 'A', lineageId: 'lavinho', nodes: ['lavinho_curva'], attrs: { passe: 9 } }, {}, { attrs: { defesa: 60 } }, {});
    place(s, { A1: { x: 2, y: 3 }, A2: { x: 7, y: 3 }, B1: { x: 4, y: 3 }, B2: { x: 9, y: 6 } }, 'A1');
    const r = resolveTurn(
      s,
      plans(
        plan('A1', { x: 2, y: 3 }, 'passe_pe', { targetPlayer: 'A2', skill: 'passe_curva' }),
        plan('A2', { x: 7, y: 3 }, 'mover'),
        plan('B1', { x: 4, y: 3 }, 'fechar_linha'),
        plan('B2', { x: 9, y: 6 }, 'mover'),
        ...gk(s),
      ),
    );
    const pass = r.events.find((e) => e.t === 'pass');
    expect(pass?.t === 'pass' && pass.result === 'intercepted').toBe(false);
  });

  it('Samba Livre exige Driblar', () => {
    const s = place(duelSetup({ lineageId: 'lavinho', nodes: 'all' }), { A1: { x: 3, y: 3 }, B1: { x: 6, y: 3 } }, 'A1');
    expect(validatePlan(s, plan('A1', { x: 4, y: 3 }, 'conduzir', { skill: 'samba_livre' })).ok).toBe(false);
    expect(validatePlan(s, plan('A1', { x: 4, y: 3 }, 'driblar', { skill: 'samba_livre' })).ok).toBe(true);
  });
});

describe('maestria', () => {
  it('reduz o custo de fôlego em 2 por nível', () => {
    const s = duelSetup({ lineageId: 'kuon', nodes: ['kuon_arrancada'], mastery: { arrancada: 30 } });
    expect(skillOptions(s, 'A1').find((o) => o.skillId === 'arrancada')?.stamina).toBe(16);
  });
});
