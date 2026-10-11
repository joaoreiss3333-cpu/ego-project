import { describe, expect, it } from 'vitest';
import { botSlot, buildSetup, keeperSlot, turnos, type Cell } from '../src';

const { createTurnos, applyAction, legalActions, currentActorId, autoAction, TurnosError } = turnos;
type TState = turnos.TState;

/** Atributos todos iguais (5; Visão 3 → +1), para as contas dos testes ficarem simples. */
const FLAT = { velocidade: 5, drible: 5, passe: 5, chute: 5, fisico: 5, visao: 3, defesa: 5 };

function match(mode: '1v1' | '2v2' | '3v3' = '2v2', halves = 2): TState {
  const n = Number(mode[0]);
  const slots = [];
  for (const t of ['A', 'B'] as const) {
    for (let i = 0; i < n; i++) {
      const s = botSlot({ name: `${t}${i + 1}`, lineageId: 'kuon', level: 5, personality: 'coletivo', position: 'atacante' }, `${t}${i + 1}`, t, 'regular');
      slots.push({ ...s, attrs: { ...FLAT } });
    }
    slots.push({ ...keeperSlot(`${t}GK`, t, 5, 'regular'), name: `${t}GK`, attrs: { ...FLAT } });
  }
  return createTurnos(buildSetup({ id: 't', seed: 'seed', mode, kind: 'simulacao', slots, turnsPerHalf: 6, halves }));
}

/** Põe jogadores em casas, dá a bola e escolhe de quem é a vez. */
function setup(s: TState, pos: Record<string, Cell>, holder: string | null, actor: string): TState {
  const c = structuredClone(s);
  for (const [id, p] of Object.entries(pos)) c.players[id].pos = { ...p };
  c.ball = holder ? { holder, pos: { ...c.players[holder].pos } } : { holder: null, pos: { x: 5, y: 3 } };
  c.cursor = c.order.indexOf(actor);
  return c;
}

const set = (s: TState, id: string, patch: Partial<turnos.TPlayer>) => Object.assign(s.players[id], patch);
const attrs = (s: TState, id: string, patch: Partial<typeof FLAT>) => Object.assign(s.setup.slots.find((x) => x.id === id)!.attrs, patch);

describe('turnos: ordem e regras básicas', () => {
  it('os times se intercalam na ordem de entrada, goleiros por último', () => {
    expect(match('3v3').order).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'AGK', 'BGK']);
  });

  it('só quem está na vez joga', () => {
    const s = match();
    expect(currentActorId(s)).toBe('A1');
    expect(() => applyAction(s, 'B1', { kind: 'passar' })).toThrow(TurnosError);
  });

  it('perder a vez só passa para o próximo e o original não muda', () => {
    const s = match();
    const r = applyAction(s, 'A1', { kind: 'passar' });
    expect(currentActorId(r.state)).toBe('B1');
    expect(currentActorId(s)).toBe('A1');
    expect(r.state.players.A1.stats.activeTurns).toBe(0);
    expect(r.state.players.A1.stats.totalTurns).toBe(1);
  });

  it('com a bola anda 1 casa, sem a bola até 2, sempre ortogonal', () => {
    let s = setup(match(), { A1: { x: 4, y: 3 }, B1: { x: 8, y: 1 }, A2: { x: 2, y: 5 }, B2: { x: 8, y: 5 } }, 'A1', 'A1');
    const withBall = legalActions(s, 'A1').move.map((c) => `${c.x},${c.y}`).sort();
    expect(withBall).toEqual(['3,3', '4,2', '4,4', '5,3']);
    s = setup(s, {}, 'A1', 'A2');
    const noBall = legalActions(s, 'A2').move;
    expect(noBall.some((c) => c.x === 4 && c.y === 5)).toBe(true);
    expect(noBall.some((c) => c.x === 2 && c.y === 3)).toBe(true);
    expect(noBall.some((c) => c.x === 3 && c.y === 3)).toBe(false); // 3 passos
    expect(noBall.every((c) => Math.abs(c.x - 2) + Math.abs(c.y - 5) <= 2)).toBe(true);
  });

  it('ninguém entra numa casa ocupada', () => {
    const s = setup(match(), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 } }, 'A1', 'A1');
    expect(legalActions(s, 'A1').move.some((c) => c.x === 5 && c.y === 3)).toBe(false);
  });

  it('pegar a bola solta: quem pisa nela fica com ela', () => {
    const s = setup(match(), { A1: { x: 3, y: 3 }, B1: { x: 8, y: 1 }, A2: { x: 2, y: 5 } }, null, 'A2');
    s.ball = { holder: null, pos: { x: 3, y: 5 } };
    const r = applyAction(s, 'A2', { kind: 'mover', dest: { x: 3, y: 5 } });
    expect(r.state.ball.holder).toBe('A2');
  });

  it('é determinístico: mesma seed, mesmo resultado', () => {
    const play = () => {
      let s = match('2v2');
      let n = 0;
      while (!s.finished && n++ < 2000) {
        const { actor, action } = autoAction(s);
        s = applyAction(s, actor, action).state;
      }
      return `${s.score.A}-${s.score.B}-${s.turnCount}`;
    };
    expect(play()).toBe(play());
  });

  it('partidas de bots terminam em todos os modos', () => {
    for (const mode of ['1v1', '2v2', '3v3'] as const) {
      let s = match(mode);
      let n = 0;
      while (!s.finished && n++ < 3000) {
        const { actor, action } = autoAction(s);
        s = applyAction(s, actor, action).state;
      }
      expect(s.finished).toBe(true);
      expect(['A', 'B', 'draw']).toContain(s.winner);
    }
  });
});

describe('turnos: desarme', () => {
  // A1 com a bola em (5,3), B1 colado em (6,3); vez do B1.
  const duel = () => setup(match(), { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 }, A2: { x: 2, y: 1 }, B2: { x: 8, y: 5 } }, 'A1', 'B1');

  it('Bote vence: Defesa + dado contra Físico + dado, e rouba a bola', () => {
    const r = applyAction(duel(), 'B1', { kind: 'bote' }, { dice: [8, 2] });
    expect(r.state.ball.holder).toBe('B1');
    expect(r.state.players.B1.stats.tackles).toBe(1);
  });

  it('empate estagna: nada muda e ninguém perde nada', () => {
    const r = applyAction(duel(), 'B1', { kind: 'bote' }, { dice: [4, 4] });
    expect(r.state.ball.holder).toBe('A1');
    expect(r.state.players.B1.fouls).toBe(0);
    expect(r.state.players.B1.fallen).toBe(false);
    expect(r.state.freeKick).toBeNull();
  });

  it('perdeu o Bote sem falta: nada acontece', () => {
    const r = applyAction(duel(), 'B1', { kind: 'bote' }, { dice: [1, 10, 9] });
    expect(r.state.ball.holder).toBe('A1');
    expect(r.state.players.B1.fouls).toBe(0);
  });

  it('o Carrinho soma +3 e, perdendo sem falta, derruba quem tentou', () => {
    const win = applyAction(duel(), 'B1', { kind: 'carrinho' }, { dice: [4, 6] });
    expect(win.state.ball.holder).toBe('B1'); // 5+4+3 = 12 contra 5+6 = 11
    const lose = applyAction(duel(), 'B1', { kind: 'carrinho' }, { dice: [1, 10, 9] });
    expect(lose.state.ball.holder).toBe('A1');
    expect(lose.state.players.B1.fallen).toBe(true);
    // caído: não se move no próximo turno
    const next = setup(lose.state, {}, 'A1', 'B1');
    expect(legalActions(next, 'B1').move).toEqual([]);
  });

  it('a falta só existe quando perde, e dá tiro livre com turno extra para o faltado', () => {
    const r = applyAction(duel(), 'B1', { kind: 'bote' }, { dice: [1, 10, 2, 9] });
    expect(r.state.players.B1.fouls).toBe(1);
    expect(r.state.freeKick).toEqual({ player: 'A1', kind: 'direto' });
    expect(currentActorId(r.state)).toBe('A1');
    // o marcador colado recuou 1 casa
    expect(r.state.players.B1.pos).toEqual({ x: 7, y: 3 });
    // depois da cobrança, segue a ordem normal a partir de quem faltou
    const kick = applyAction(r.state, 'A1', { kind: 'chutar', corner: 0 }, { dice: [3, 3], keeperGuess: 1 });
    expect(kick.state.freeKick).toBeNull();
    if (!kick.goal) expect(currentActorId(kick.state)).toBe('A2');
  });

  it('o Carrinho dá mais falta e amarelo; dois amarelos expulsam', () => {
    const s0 = duel();
    set(s0, 'B1', { yellow: 1 });
    const r = applyAction(s0, 'B1', { kind: 'carrinho' }, { dice: [1, 10, 5, 4] }); // falta (<=5), amarelo (<=4)
    expect(r.state.players.B1.yellow).toBe(2);
    expect(r.state.players.B1.offUntil).toBe(9999);
    expect(r.events.some((e) => e.t === 'foul' && e.card === 'vermelho')).toBe(true);
    // expulso não joga mais: a ordem pula ele
    let s = r.state;
    s = applyAction(s, 'A1', { kind: 'passar' }).state;
    expect(currentActorId(s)).not.toBe('B1');
  });

  it('falta na própria área é pênalti', () => {
    const s = setup(match(), { A1: { x: 9, y: 2 }, B1: { x: 9, y: 3 }, A2: { x: 2, y: 1 }, B2: { x: 4, y: 5 } }, 'A1', 'B1');
    const r = applyAction(s, 'B1', { kind: 'bote' }, { dice: [1, 10, 1, 9] });
    expect(r.state.freeKick).toEqual({ player: 'A1', kind: 'penalti' });
    expect(r.state.players.A1.pos).toEqual({ x: 7, y: 3 }); // marca a 3 casas da linha do gol
    expect(legalActions(r.state, 'A1').chutar).toBe(true);
    expect(legalActions(r.state, 'A1').passes.curto).toEqual([]);
  });

  it('Conter: vencendo, a próxima ação do alvo sofre -3 (portador) e some depois', () => {
    const r = applyAction(duel(), 'B1', { kind: 'conter', target: 'A1' }, { dice: [9, 1] });
    expect(r.state.players.A1.conter).toBe(3);
    // próxima ação do A1: o -3 entra na rolagem do chute e é consumido
    let s = setup(r.state, {}, 'A1', 'A1');
    const shot = applyAction(s, 'A1', { kind: 'chutar', corner: 1 }, { dice: [5, 5], keeperGuess: null });
    expect(shot.log.join(' ')).toContain('Conter sofrido 3');
    expect(shot.state.players.A1.conter).toBe(0);
  });

  it('Cobertura: outro marcador colado no portador soma +1 ao desarme', () => {
    const s = setup(match(), { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 }, B2: { x: 5, y: 2 }, A2: { x: 2, y: 1 } }, 'A1', 'B1');
    const r = applyAction(s, 'B1', { kind: 'bote' }, { dice: [3, 4] }); // 5+3+1 = 9 contra 5+4 = 9... empate sem cobertura seria 8x9
    expect(r.log.join(' ')).toContain('cobertura 1');
    expect(r.state.ball.holder).toBe('A1'); // empate
  });

  it('no 1v1 o vermelho vira suspensão de rodadas', () => {
    const s = setup(match('1v1'), { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 } }, 'A1', 'B1');
    set(s, 'B1', { yellow: 1 });
    const r = applyAction(s, 'B1', { kind: 'carrinho' }, { dice: [1, 10, 5, 4] });
    expect(r.state.players.B1.offUntil).toBe(s.round + 3);
  });
});

describe('turnos: drible', () => {
  const drib = () => setup(match(), { A1: { x: 4, y: 3 }, B1: { x: 5, y: 3 }, A2: { x: 1, y: 1 }, B2: { x: 8, y: 5 } }, 'A1', 'A1');

  it('precisa de adversário colado e a casa de trás livre', () => {
    expect(legalActions(drib(), 'A1').driblar).toEqual([{ target: 'B1', landing: { x: 6, y: 3 } }]);
    const blocked = setup(drib(), { B2: { x: 6, y: 3 } }, 'A1', 'A1');
    expect(legalActions(blocked, 'A1').driblar).toEqual([]);
  });

  it('vence: salta por cima e cai atrás dele com a bola', () => {
    const r = applyAction(drib(), 'A1', { kind: 'driblar', target: 'B1' }, { dice: [9, 1] });
    expect(r.state.players.A1.pos).toEqual({ x: 6, y: 3 });
    expect(r.state.ball.holder).toBe('A1');
  });

  it('empate: ninguém passa', () => {
    const r = applyAction(drib(), 'A1', { kind: 'driblar', target: 'B1' }, { dice: [5, 5] });
    expect(r.state.players.A1.pos).toEqual({ x: 4, y: 3 });
    expect(r.state.ball.holder).toBe('A1');
  });

  it('perde: o defensor fica com a bola', () => {
    const r = applyAction(drib(), 'A1', { kind: 'driblar', target: 'B1' }, { dice: [1, 10] });
    expect(r.state.ball.holder).toBe('B1');
  });
});

describe('turnos: passes', () => {
  // A1 (3,3) com a bola, A2 (5,3) alinhado, B1 (4,3) no meio.
  const pass = () => setup(match(), { A1: { x: 3, y: 3 }, A2: { x: 5, y: 3 }, B1: { x: 4, y: 3 }, B2: { x: 8, y: 1 } }, 'A1', 'A1');

  it('o passe curto é cortado por quem está no caminho', () => {
    const r = applyAction(pass(), 'A1', { kind: 'passe', type: 'curto', to: { x: 5, y: 3 } }, { dice: [6, 9] });
    expect(r.state.ball.holder).toBe('B1');
  });

  it('empate na interceptação: o passe não sai, a bola fica com quem passou', () => {
    const r = applyAction(pass(), 'A1', { kind: 'passe', type: 'curto', to: { x: 5, y: 3 } }, { dice: [6, 5] });
    expect(r.state.ball.holder).toBe('A1');
  });

  it('o passe curto chega quando ninguém corta', () => {
    const r = applyAction(pass(), 'A1', { kind: 'passe', type: 'curto', to: { x: 5, y: 3 } }, { dice: [6, 2] });
    expect(r.state.ball.holder).toBe('A2');
    expect(r.state.players.A1.stats.passesCompleted).toBe(1);
  });

  it('o passe longo passa por cima do marcador', () => {
    const r = applyAction(pass(), 'A1', { kind: 'passe', type: 'longo', to: { x: 5, y: 3 } }, { dice: [8] });
    expect(r.state.ball.holder).toBe('A2'); // 5 + 8 + Visão 1 - 0 = 14 (precisa de 9)
  });

  it('o passe curto só vai até 3 casas e em linha reta', () => {
    const s = setup(match(), { A1: { x: 2, y: 3 }, A2: { x: 7, y: 3 }, B1: { x: 9, y: 1 }, B2: { x: 9, y: 5 } }, 'A1', 'A1');
    const L = legalActions(s, 'A1');
    expect(L.passes.curto.map((o) => o.receiver)).not.toContain('A2');
    expect(L.passes.longo.map((o) => o.receiver)).toContain('A2');
    const diag = setup(s, { A2: { x: 4, y: 4 } }, 'A1', 'A1');
    expect(legalActions(diag, 'A1').passes.curto.map((o) => o.receiver)).not.toContain('A2');
  });

  it('a profundidade manda a bola para uma casa vazia e o aliado corre até ela', () => {
    const s = setup(match(), { A1: { x: 3, y: 3 }, A2: { x: 5, y: 2 }, B1: { x: 9, y: 0 }, B2: { x: 9, y: 6 } }, 'A1', 'A1');
    const L = legalActions(s, 'A1');
    const o = L.passes.profundidade.find((x) => x.to.x === 6 && x.to.y === 3 && x.receiver === 'A2');
    expect(o).toBeDefined();
    const r = applyAction(s, 'A1', { kind: 'passe', type: 'profundidade', to: { x: 6, y: 3 }, runner: 'A2' }, { dice: [6] });
    expect(r.state.ball.holder).toBe('A2');
    expect(r.state.players.A2.pos).toEqual({ x: 6, y: 3 });
  });

  it('corrida na profundidade: o adversário mais rápido chega antes; empate deixa a bola solta', () => {
    const base = setup(match(), { A1: { x: 3, y: 3 }, A2: { x: 5, y: 2 }, B1: { x: 7, y: 3 }, B2: { x: 9, y: 6 } }, 'A1', 'A1');
    const lose = applyAction(base, 'A1', { kind: 'passe', type: 'profundidade', to: { x: 6, y: 3 }, runner: 'A2' }, { dice: [6, 2, 9] });
    expect(lose.state.ball.holder).toBe('B1');
    const tie = applyAction(base, 'A1', { kind: 'passe', type: 'profundidade', to: { x: 6, y: 3 }, runner: 'A2' }, { dice: [6, 5, 5] });
    expect(tie.state.ball.holder).toBeNull();
    expect(tie.state.ball.pos).toEqual({ x: 6, y: 3 });
  });

  it('cruzamento só sai dos corredores laterais para a área', () => {
    const mid = setup(match(), { A1: { x: 6, y: 3 }, A2: { x: 9, y: 3 }, B1: { x: 3, y: 1 }, B2: { x: 3, y: 5 } }, 'A1', 'A1');
    expect(legalActions(mid, 'A1').passes.cruzamento).toEqual([]);
    const wing = setup(mid, { A1: { x: 6, y: 0 } }, 'A1', 'A1');
    expect(legalActions(wing, 'A1').passes.cruzamento.map((o) => o.receiver)).toEqual(['A2']);
  });

  it('passe torto: sai solta (ou alguém pega) em vez de chegar', () => {
    const s = pass();
    attrs(s, 'A1', { passe: 3 });
    s.players.B1.pos = { x: 8, y: 1 };
    const r = applyAction(s, 'A1', { kind: 'passe', type: 'curto', to: { x: 5, y: 3 } }, { dice: [2] }); // 3+2 = 5 < 6
    expect(r.state.ball.holder === 'A2').toBe(false);
  });
});

describe('turnos: chute e goleiro', () => {
  const shot = () => setup(match(), { A1: { x: 8, y: 3 }, B1: { x: 3, y: 1 }, A2: { x: 2, y: 5 }, B2: { x: 4, y: 5 } }, 'A1', 'A1');

  it('gol quando o chute vence e o goleiro errou o canto', () => {
    const r = applyAction(shot(), 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 3], keeperGuess: 1 });
    expect(r.goal).toBe('A');
    expect(r.state.score.A).toBe(1);
    // a bola volta ao centro com a posse de quem sofreu o gol
    expect(r.state.ball.holder).toBe('B1');
  });

  it('acertar o canto dá +4 ao goleiro: defende ou espalma', () => {
    const save = applyAction(shot(), 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 4], keeperGuess: 0 });
    expect(save.goal).toBeNull();
    expect(save.state.ball.holder).toBe('BGK');
    const tie = applyAction(shot(), 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 3], keeperGuess: 0 });
    expect(tie.state.ball.holder).toBeNull(); // rebote: 12 contra 12
  });

  it('goleiro que não adivinhou (tempo esgotado) não ganha o +4', () => {
    const r = applyAction(shot(), 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 4], keeperGuess: null });
    expect(r.goal).toBe('A');
  });

  it('o goleiro bot chuta o canto que o chutador mais usa', () => {
    let s = shot();
    s.shotHistory.A1 = [0, 0, 5];
    expect(turnos.botKeeperGuess(s, 'A1')).toBe(2);
    s.shotHistory.A1 = [0, 0, 0];
    expect(turnos.botKeeperGuess(s, 'A1')).toBe(1);
  });

  it('distância: grátis até 4 casas, depois -1 a cada 2', () => {
    const far = setup(shot(), { A1: { x: 5, y: 3 } }, 'A1', 'A1'); // 5 casas do gol
    const r = applyAction(far, 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 1], keeperGuess: null });
    expect(r.log.join(' ')).toContain('distância (5) 1');
  });

  it('marcadores colados atrapalham o chute', () => {
    const s = setup(shot(), { B1: { x: 7, y: 3 } }, 'A1', 'A1');
    const r = applyAction(s, 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 1], keeperGuess: null });
    expect(r.log.join(' ')).toContain('marcadores colados 1');
  });

  it('assistência: gol de quem recebeu o passe', () => {
    let s = setup(match(), { A1: { x: 7, y: 3 }, A2: { x: 9, y: 3 }, B1: { x: 3, y: 1 }, B2: { x: 4, y: 5 } }, 'A1', 'A1');
    s = applyAction(s, 'A1', { kind: 'passe', type: 'curto', to: { x: 9, y: 3 } }, { dice: [6] }).state;
    expect(s.ball.holder).toBe('A2');
    s = setup(s, {}, 'A2', 'A2');
    const r = applyAction(s, 'A2', { kind: 'chutar', corner: 2 }, { dice: [8, 1], keeperGuess: 1 });
    expect(r.goal).toBe('A');
    expect(r.state.players.A1.stats.assists).toBe(1);
  });

  it('o goleiro com a bola pode andar e repor', () => {
    const s = setup(match(), { A1: { x: 4, y: 1 }, A2: { x: 2, y: 3 }, B1: { x: 8, y: 1 }, B2: { x: 8, y: 5 }, AGK: { x: 0, y: 3 } }, 'AGK', 'AGK');
    const L = legalActions(s, 'AGK');
    expect(L.move.length).toBeGreaterThan(0);
    expect(L.passes.curto.map((o) => o.receiver)).toContain('A2');
  });
});

describe('turnos: fim de partida', () => {
  it('termina depois dos tempos e define o vencedor', () => {
    let s = match('1v1');
    let n = 0;
    while (!s.finished && n++ < 3000) s = applyAction(s, currentActorId(s), { kind: 'passar' }).state;
    expect(s.finished).toBe(true);
    expect(s.winner).toBe('draw');
    expect(s.half).toBe(2);
  });

  it('primeiro a N gols encerra', () => {
    const s = match();
    s.setup.firstTo = 1;
    const c = setup(s, { A1: { x: 8, y: 3 }, B1: { x: 3, y: 1 }, A2: { x: 2, y: 5 }, B2: { x: 4, y: 5 } }, 'A1', 'A1');
    const r = applyAction(c, 'A1', { kind: 'chutar', corner: 0 }, { dice: [7, 3], keeperGuess: 1 });
    expect(r.state.finished).toBe(true);
    expect(r.state.winner).toBe('A');
  });
});
