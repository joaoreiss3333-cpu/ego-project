import { isInArea, type Cell } from '../grid';
import { Rng } from '../rng';
import { adjacentOpponents, attr, currentActorId, dirOf, goalDistance, holderOf, keeperOf, manh, other, playersOn, same, slotOf, visBonus, between, occupant } from './core';
import { legalActions } from './legal';
import { TURNOS } from './rules';
import type { Action, Corner, LegalSet, PassType, TPlayer, TState } from './types';

/** P(a + d10 > b + d10): chance de vencer um duelo (empate não vence). */
export function pBeat(a: number, b: number): number {
  let n = 0;
  for (let x = 1; x <= 10; x++) for (let y = 1; y <= 10; y++) if (a + x > b + y) n++;
  return n / 100;
}

/** P(base + d10 >= need). */
function pAtLeast(base: number, need: number): number {
  const k = need - base;
  if (k <= 1) return 1;
  if (k > 10) return 0;
  return (11 - k) / 10;
}

const NOISE = { novato: 3, regular: 1.3, elite: 0.5, chefe: 0.15 } as const;

interface Cand {
  action: Action;
  score: number;
}

function leastUsedCorner(s: TState, id: string, rng: Rng): Corner {
  const h = s.shotHistory[id] ?? [0, 0, 0];
  const min = Math.min(...h);
  return rng.pick([0, 1, 2].filter((c) => h[c] === min)) as Corner;
}

/** O que um bot faz no turno de `id` (sempre uma ação legal). */
export function chooseAction(s: TState, id: string): Action {
  const p = s.players[id];
  const L = legalActions(s, id);
  const rng = new Rng(`${s.setup.seed}|${s.turnCount}|${id}`);
  const diff = slotOf(s, id).difficulty;
  const noise = NOISE[diff] ?? NOISE.regular;
  const cands: Cand[] = [{ action: { kind: 'passar' }, score: -50 }];

  if (L.mode !== 'normal') freeKickCands(s, p, L, rng, cands);
  else if (p.isKeeper) keeperCands(s, p, L, cands);
  else if (s.ball.holder === id) carrierCands(s, p, L, rng, cands);
  else defenderCands(s, p, L, cands);

  let best = cands[0];
  let bestScore = -Infinity;
  for (const c of cands) {
    const sc = c.score + rng.next() * noise;
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }
  return best.action;
}

// ---------------------------------------------------------------------------
// Portador
// ---------------------------------------------------------------------------

function shotScore(s: TState, p: TPlayer, o: { header?: boolean; penalty?: boolean; free?: boolean } = {}): number {
  const dist = goalDistance(s, p.team, p.pos);
  const k = keeperOf(s, other(p.team));
  const base = o.header ? Math.floor((attr(s, p.id, 'chute') + attr(s, p.id, 'fisico')) / 2) : attr(s, p.id, 'chute');
  const distPen = o.header || o.penalty ? 0 : dist > TURNOS.shot.freeDistance ? Math.ceil((dist - TURNOS.shot.freeDistance) / TURNOS.shot.penaltyEvery) : 0;
  const markers = o.header || o.penalty || o.free ? 0 : adjacentOpponents(s, p).filter((x) => !x.isKeeper).length * TURNOS.shot.markerPenalty;
  const kDef = k ? attr(s, k.id, 'defesa') + Math.round(TURNOS.shot.keeperCorner / 3) : 0;
  const pGoal = k ? pBeat(base - distPen - markers, kDef) : 1;
  return pGoal * 12;
}

function passPrecision(s: TState, p: TPlayer, type: PassType, dist: number): number {
  const T = TURNOS.pass[type];
  const pen = type === 'longo' || type === 'profundidade' ? Math.max(0, Math.ceil((dist - TURNOS.pass[type].free) / TURNOS.pass[type].every)) : 0;
  return pAtLeast(attr(s, p.id, 'passe') + (type === 'curto' ? 0 : visBonus(s, p.id)) - pen, T.threshold);
}

function carrierCands(s: TState, p: TPlayer, L: LegalSet, rng: Rng, out: Cand[]) {
  const dir = dirOf(p.team);
  const opp = playersOn(s).filter((o) => o.team !== p.team && !o.isKeeper);
  const here = goalDistance(s, p.team, p.pos);

  if (L.chutar) out.push({ action: { kind: 'chutar', corner: leastUsedCorner(s, p.id, rng) }, score: shotScore(s, p) - (here > 5 ? 1.5 : 0) });

  for (const type of ['curto', 'longo', 'profundidade', 'cruzamento'] as PassType[]) {
    for (const o of L.passes[type]) {
      const r = s.players[o.receiver];
      const prec = passPrecision(s, p, type, o.dist);
      let blockers = 0;
      if (type === 'curto' || type === 'profundidade') for (const c of between(p.pos, o.to) ?? []) if (opp.some((x) => same(x.pos, c))) blockers++;
      const safe = prec * Math.pow(0.45, blockers);
      const threat = (TURNOS.shot.maxDistance - goalDistance(s, p.team, o.to)) * 0.25;
      const adv = dir * (o.to.x - p.pos.x);
      const pressed = adjacentOpponents(s, r).length * 0.5;
      let value: number;
      if (type === 'cruzamento') {
        const base = Math.floor((attr(s, r.id, 'chute') + attr(s, r.id, 'fisico')) / 2);
        const k = keeperOf(s, other(p.team));
        value = safe * 0.75 * pBeat(base, (k ? attr(s, k.id, 'defesa') : 0) + 1) * 12 * 0.9;
      } else value = safe * (adv * 0.7 + threat + 0.4) - pressed;
      // parceiros mais perto do gol que o portador valem mais
      if (type === 'profundidade') value *= 1.05;
      out.push({ action: { kind: 'passe', type, to: o.to, runner: type === 'profundidade' ? o.receiver : undefined }, score: value });
    }
  }

  for (const d of L.driblar) {
    const t = s.players[d.target];
    const cov = adjacentOpponents(s, p).filter((x) => x.id !== t.id && !x.isKeeper).length * TURNOS.coverage;
    const w = pBeat(attr(s, p.id, 'drible'), attr(s, t.id, 'defesa') + cov);
    const adv = dir * (d.landing.x - p.pos.x);
    out.push({ action: { kind: 'driblar', target: t.id }, score: w * (1.5 + adv * 0.7) - (1 - w) * 3.2 });
  }

  for (const c of L.move) {
    const adv = dir * (c.x - p.pos.x);
    const dGoal = goalDistance(s, p.team, c);
    const marked = opp.filter((o) => manh(o.pos, c) === 1).length;
    out.push({ action: { kind: 'mover', dest: c }, score: adv * 0.9 + (here - dGoal) * 0.4 - marked * 1.4 + 0.3 });
  }
}

// ---------------------------------------------------------------------------
// Sem a bola
// ---------------------------------------------------------------------------

function defenderCands(s: TState, p: TPlayer, L: LegalSet, out: Cand[]) {
  const h = holderOf(s);
  const dir = dirOf(p.team);

  if (L.bote && h) {
    const cov = adjacentOpponents(s, h).filter((x) => x.id !== p.id && !x.isKeeper).length * TURNOS.coverage;
    const def = attr(s, p.id, 'defesa') + cov;
    const fis = attr(s, h.id, 'fisico');
    const pb = pBeat(def, fis);
    const pc = pBeat(def + TURNOS.carrinhoBonus, fis);
    const danger = goalDistance(s, h.team, h.pos) <= 4 ? 1.5 : 0;
    out.push({ action: { kind: 'bote' }, score: pb * 5 - (1 - pb) * TURNOS.foul.bote / 10 * 3 + danger * pb });
    out.push({ action: { kind: 'carrinho' }, score: pc * 5 - (1 - pc) * (TURNOS.foul.carrinho / 10 * 4 + 1.2) + danger * pc });
  }
  for (const id of L.conter) {
    const t = s.players[id];
    const pw = pBeat(attr(s, p.id, 'defesa'), attr(s, t.id, 'fisico'));
    out.push({ action: { kind: 'conter', target: id }, score: pw * (t.id === s.ball.holder ? 2.8 : 1.0) });
  }

  // movimento
  const target = h ? h.pos : s.ball.pos;
  const mine = h && h.team === p.team;
  for (const c of L.move) {
    let v: number;
    if (mine) {
      // apoio: abrir na frente do portador, alinhado para receber, longe dos marcadores
      const adv = dir * (c.x - p.pos.x);
      const aligned = h && between(h.pos, c) !== null && manh(h.pos, c) <= 4 ? 1 : 0;
      const marked = playersOn(s).filter((o) => o.team !== p.team && !o.isKeeper && manh(o.pos, c) <= 1).length;
      v = adv * 0.6 + aligned * 1.1 - marked * 1.0 + (goalDistance(s, p.team, p.pos) - goalDistance(s, p.team, c)) * 0.3;
    } else {
      // defesa: chegar no portador (ou na bola solta), ficando do lado do próprio gol
      const closer = manh(p.pos, target) - manh(c, target);
      const goalSide = h ? dir * (h.pos.x - c.x) * 0.0 : 0;
      v = closer * 1.2 + goalSide - (manh(c, target) === 0 ? 0.2 : 0);
    }
    out.push({ action: { kind: 'mover', dest: c }, score: v });
  }
}

// ---------------------------------------------------------------------------
// Goleiro
// ---------------------------------------------------------------------------

function keeperCands(s: TState, p: TPlayer, L: LegalSet, out: Cand[]) {
  const loose = !s.ball.holder && isInArea(s.ball.pos, p.team, s.setup.field);
  const sair = L.goleiro.find((g) => g.posture === 'sair');
  if (loose && sair?.dests?.some((c) => same(c, s.ball.pos))) out.push({ action: { kind: 'goleiro', posture: 'sair', dest: s.ball.pos }, score: 20 });
  if (s.ball.holder === p.id) {
    // reposição: o passe mais seguro para frente
    const dir = dirOf(p.team);
    for (const type of ['curto', 'longo'] as PassType[])
      for (const o of L.passes[type]) {
        const prec = passPrecision(s, p, type, o.dist);
        let blockers = 0;
        if (type === 'curto') for (const c of between(p.pos, o.to) ?? []) if (occupant(s, c)?.team !== p.team && occupant(s, c)) blockers++;
        out.push({ action: { kind: 'passe', type, to: o.to }, score: prec * Math.pow(0.4, blockers) * (4 + dir * (o.to.x - p.pos.x) * 0.5) });
      }
    // sem passe à vista: anda 1 casa para se alinhar a um aliado
    const mates = playersOn(s).filter((o) => o.team === p.team && o.id !== p.id);
    for (const c of L.move) {
      const aligned = mates.filter((m) => between(c, m.pos) !== null && manh(c, m.pos) <= 5).length;
      out.push({ action: { kind: 'mover', dest: c }, score: aligned * 1.2 });
    }
    out.push({ action: { kind: 'goleiro', posture: 'posicionar', dest: p.pos }, score: 0.1 });
    return;
  }
  const pos = L.goleiro.find((g) => g.posture === 'posicionar');
  const h = holderOf(s);
  const ty = (h ?? { pos: s.ball.pos }).pos.y;
  for (const c of pos?.dests ?? []) out.push({ action: { kind: 'goleiro', posture: 'posicionar', dest: c }, score: -Math.abs(c.y - ty) * 1.0 - Math.abs(c.x - p.pos.x) * 0.2 + 2 });
  if (h && h.team !== p.team && goalDistance(s, h.team, h.pos) <= 5) out.push({ action: { kind: 'goleiro', posture: 'sair' }, score: 1.0 });
}

// ---------------------------------------------------------------------------
// Falta e pênalti
// ---------------------------------------------------------------------------

function freeKickCands(s: TState, p: TPlayer, L: LegalSet, rng: Rng, out: Cand[]) {
  if (L.chutar) {
    const penalty = L.mode === 'penalti';
    out.push({ action: { kind: 'chutar', corner: leastUsedCorner(s, p.id, rng) }, score: shotScore(s, p, { penalty, free: true }) });
  }
  if (L.mode === 'penalti') return;
  const dir = dirOf(p.team);
  for (const type of ['curto', 'longo', 'profundidade', 'cruzamento'] as PassType[])
    for (const o of L.passes[type]) {
      const prec = passPrecision(s, p, type, o.dist);
      const adv = dir * (o.to.x - p.pos.x);
      const v = type === 'cruzamento' ? prec * 6 : prec * (adv * 0.6 + (TURNOS.shot.maxDistance - goalDistance(s, p.team, o.to)) * 0.25 + 0.4);
      out.push({ action: { kind: 'passe', type, to: o.to, runner: type === 'profundidade' ? o.receiver : undefined }, score: v });
    }
}

/** Joga o turno de quem está na vez com a IA (para simulações e testes). */
export function autoAction(s: TState): { actor: string; action: Action } {
  const actor = currentActorId(s);
  return { actor, action: chooseAction(s, actor) };
}
