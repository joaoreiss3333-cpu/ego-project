import { isInArea, type Cell } from '../grid';
import { adjacentOpponents, between, dirOf, goalDistance, holderOf, inLane, isGoalCell, manh, occupant, other, playersOn, reach, same, walkable } from './core';
import { TURNOS } from './rules';
import type { LegalSet, PassOption, PassType, TPlayer, TState } from './types';

export function emptyLegal(): LegalSet {
  return {
    mode: 'normal',
    move: [],
    bote: false,
    carrinho: false,
    conter: [],
    driblar: [],
    passes: { curto: [], longo: [], profundidade: [], cruzamento: [] },
    chutar: false,
    goleiro: [],
  };
}

/** Casa onde o portador cai ao driblar `target` (a casa logo atrás dele), ou null se não der. */
export function dribbleLanding(s: TState, p: TPlayer, target: TPlayer): Cell | null {
  if (manh(p.pos, target.pos) !== 1) return null;
  const landing = { x: target.pos.x + (target.pos.x - p.pos.x), y: target.pos.y + (target.pos.y - p.pos.y) };
  return walkable(s, p, landing) ? landing : null;
}

export function passOptions(s: TState, p: TPlayer): Record<PassType, PassOption[]> {
  const out: Record<PassType, PassOption[]> = { curto: [], longo: [], profundidade: [], cruzamento: [] };
  const mates = playersOn(s).filter((o) => o.team === p.team && o.id !== p.id);
  const P = TURNOS.pass;
  for (const o of mates) {
    const d = manh(p.pos, o.pos);
    const aligned = between(p.pos, o.pos) !== null;
    if (aligned && d >= 1 && d <= P.curto.range) out.curto.push({ to: { ...o.pos }, receiver: o.id, dist: d });
    if (aligned && d >= 2 && d <= P.longo.range) out.longo.push({ to: { ...o.pos }, receiver: o.id, dist: d });
    if (!p.isKeeper && !o.isKeeper && inLane(s, p.pos) && isInArea(o.pos, other(p.team), s.setup.field)) out.cruzamento.push({ to: { ...o.pos }, receiver: o.id, dist: d });
  }
  if (!p.isKeeper) {
    const dir = dirOf(p.team);
    for (const r of mates) {
      if (r.isKeeper) continue;
      for (const c of reach(s, r, P.profundidade.run)) {
        const d = manh(p.pos, c);
        if (d < 1 || d > P.profundidade.range) continue;
        if (between(p.pos, c) === null) continue;
        if (dir * (c.x - r.pos.x) < 0) continue;
        if (occupant(s, c) || isGoalCell(s, c)) continue;
        out.profundidade.push({ to: c, receiver: r.id, dist: d });
      }
    }
  }
  return out;
}

/** O que `id` pode fazer agora. Vazio se não for a vez dele. */
export function legalActions(s: TState, id: string): LegalSet {
  const L = emptyLegal();
  const p = s.players[id];
  if (!p || s.finished) return L;
  const fk = s.freeKick;
  if (fk && fk.player !== id) return L;
  if (!fk && s.order[s.cursor] !== id) return L;
  const hasBall = s.ball.holder === id;

  if (fk) {
    L.mode = fk.kind === 'penalti' ? 'penalti' : 'falta';
    if (hasBall) {
      L.chutar = fk.kind === 'penalti' || goalDistance(s, p.team, p.pos) <= TURNOS.shot.maxDistance;
      if (fk.kind === 'direto') L.passes = passOptions(s, p);
    }
    return L;
  }

  if (p.isKeeper) {
    const dests = hasBall ? [{ ...p.pos }] : [{ ...p.pos }, ...reach(s, p, TURNOS.keeper.move)];
    L.goleiro = [
      { posture: 'posicionar', dests },
      { posture: 'adiantar' },
      { posture: 'comandar', allies: playersOn(s).filter((o) => o.team === p.team && !o.isKeeper && isInArea(o.pos, p.team, s.setup.field)).map((o) => o.id) },
      { posture: 'sair', dests },
    ];
    if (hasBall) {
      // com a bola o goleiro anda 1 casa na área para se alinhar a um aliado, ou repõe
      L.move = reach(s, p, TURNOS.move.withBall);
      const po = passOptions(s, p);
      L.passes = { ...po, cruzamento: [], profundidade: [] };
    }
    return L;
  }

  if (hasBall) {
    if (!p.fallen) L.move = reach(s, p, TURNOS.move.withBall);
    for (const o of adjacentOpponents(s, p)) {
      if (o.isKeeper) continue;
      const landing = dribbleLanding(s, p, o);
      if (landing) L.driblar.push({ target: o.id, landing });
    }
    L.passes = passOptions(s, p);
    L.chutar = goalDistance(s, p.team, p.pos) <= TURNOS.shot.maxDistance;
    return L;
  }

  if (!p.fallen) L.move = reach(s, p, TURNOS.move.noBall);
  const h = holderOf(s);
  if (h && h.team !== p.team && manh(h.pos, p.pos) === 1) {
    L.bote = true;
    L.carrinho = true;
  }
  L.conter = adjacentOpponents(s, p).map((o) => o.id);
  return L;
}

export const hasAny = (L: LegalSet): boolean =>
  L.move.length > 0 ||
  L.bote ||
  L.carrinho ||
  L.conter.length > 0 ||
  L.driblar.length > 0 ||
  L.chutar ||
  L.goleiro.length > 0 ||
  Object.values(L.passes).some((x) => x.length > 0);

export { same };
