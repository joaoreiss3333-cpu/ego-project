import { MATCH_RULES, type GoalZone } from '@ego/content';
import { attackingGoalX, cheb, distToCells, eq, goalCells, goalCenter, goalRows, line, ownGoalX, rowsOutsideGoal, stepPath, type Cell } from '../grid';
import { effectiveAttrs, rollPenalty, zoneRadius } from '../mechanics';
import { zonesAdjacent } from '../resolve';
import type { MatchState, Team } from '../types';
import { type OpponentModel, predictDefense, predictKeeperZone } from './model';
import { pAtLeast, pBeat } from './prob';

/**
 * Visão de mundo de um bot: posições conhecidas (atuais) e, quando uma
 * habilidade revelou, os destinos e ações de alguns adversários.
 */
export interface World {
  state: MatchState;
  team: Team;
  /** Posição usada para cada jogador na avaliação. */
  pos: Record<string, Cell>;
  /** Ações conhecidas (reveladas por habilidade). */
  knownAction: Record<string, string>;
  model: OpponentModel;
}

export function makeWorld(state: MatchState, team: Team, model: OpponentModel): World {
  const pos: Record<string, Cell> = {};
  for (const id of state.order) pos[id] = { ...state.players[id].pos };
  return { state, team, pos, knownAction: {}, model };
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** Mapa de perigo: 0..1, maior perto e no centro do gol que `team` ataca. */
export function danger(state: MatchState, c: Cell, team: Team): number {
  const f = state.setup.field;
  const gx = attackingGoalX(team, f);
  const rows = goalRows(f);
  const dx = Math.abs(gx - c.x);
  const dy = c.y < rows[0] ? rows[0] - c.y : c.y > rows[rows.length - 1] ? c.y - rows[rows.length - 1] : 0;
  const base = clamp(1 - dx / (f.width * 0.95));
  return Math.pow(base, 1.5) * clamp(1 - 0.2 * dy);
}

export function inOwnHalf(state: MatchState, c: Cell, team: Team): boolean {
  const f = state.setup.field;
  const mid = (f.width - 1) / 2;
  return team === 'A' ? c.x < mid : c.x > mid;
}

export function enemies(w: World, includeKeeper = false): string[] {
  return w.state.order.filter((id) => w.state.players[id].team !== w.team && (includeKeeper || !w.state.players[id].isKeeper));
}

export function allies(w: World, includeKeeper = false): string[] {
  return w.state.order.filter((id) => w.state.players[id].team === w.team && (includeKeeper || !w.state.players[id].isKeeper));
}

/** Distância até o adversário de linha mais próximo. */
export function openness(w: World, c: Cell): number {
  let best = 9;
  for (const e of enemies(w)) best = Math.min(best, cheb(w.pos[e], c));
  return best;
}

/** Adversários cuja zona cobre a casa. */
export function zoneOwners(w: World, c: Cell, extra = 0): string[] {
  return enemies(w).filter((e) => {
    const r = zoneRadius(w.state, e);
    return r > 0 && cheb(w.pos[e], c) <= r + extra;
  });
}

export function attr(w: World, id: string, k: keyof ReturnType<typeof effectiveAttrs>): number {
  return effectiveAttrs(w.state, id)[k] - rollPenalty(w.state, id);
}

export interface PassEstimate {
  p: number;
  interceptors: string[];
  intercepterProbs: number[];
}

/** Chance de um passe de `from` até `to` chegar. */
export function passEstimate(w: World, passerId: string, from: Cell, to: Cell, bonus = 0, curve = 0): PassEstimate {
  const pa = attr(w, passerId, 'passe');
  const dist = cheb(from, to);
  const over = dist - Math.floor(effectiveAttrs(w.state, passerId).passe / 2);
  const pen = over > 0 ? Math.ceil(over / MATCH_RULES.pass.penaltyEvery) : 0;
  const base = pa - pen + bonus;
  let p = pAtLeast(base, MATCH_RULES.pass.astrayThreshold);
  const path = line(from, to).slice(1);
  const found = enemies(w)
    .map((e) => {
      const r = zoneRadius(w.state, e);
      const idx = path.findIndex((c) => cheb(c, w.pos[e]) <= r);
      return { e, idx };
    })
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  const interceptors: string[] = [];
  const probs: number[] = [];
  let skip = curve;
  for (const { e } of found) {
    if (skip > 0) {
      skip--;
      continue;
    }
    const known = w.knownAction[e];
    const pClose = known ? (known === 'fechar_linha' ? 1 : 0) : (predictDefense(w.model, e).fechar_linha ?? 0.15);
    const def = attr(w, e, 'defesa') + pClose * MATCH_RULES.offBall.fecharLinhaInterceptBonus;
    // interceptação acontece se Defesa + d10 >= Passe + d10
    const pInt = 1 - pBeat(base, def);
    interceptors.push(e);
    probs.push(clamp(pInt));
    p *= 1 - clamp(pInt);
  }
  return { p: clamp(p), interceptors, intercepterProbs: probs };
}

/** Distribuição da postura defensiva de um adversário (conhecida ou prevista). */
export function defenderColumns(w: World, e: string): { bote: number; conter: number; outra: number } {
  const known = w.knownAction[e];
  if (known) return { bote: known === 'bote' ? 1 : 0, conter: known === 'conter' ? 1 : 0, outra: known === 'bote' || known === 'conter' ? 0 : 1 };
  const pd = predictDefense(w.model, e);
  const bote = pd.bote ?? 0.3;
  const conter = pd.conter ?? 0.3;
  return { bote, conter, outra: Math.max(0, 1 - bote - conter) };
}

export interface DribbleEstimate {
  p: number;
  duels: string[];
  end: Cell;
}

/** Driblar por um caminho: cada zona cruzada é um duelo. */
export function dribbleEstimate(w: World, id: string, from: Cell, to: Cell, extraAtk = 0, panther = false): DribbleEstimate {
  const path = stepPath(from, to);
  const seen = new Set<string>();
  let p = 1;
  const dr = attr(w, id, 'drible') + extraAtk;
  for (const c of [from, ...path]) {
    for (const e of zoneOwners(w, c)) {
      if (seen.has(e)) continue;
      seen.add(e);
      const cols = defenderColumns(w, e);
      const def = attr(w, e, 'defesa');
      const b = MATCH_RULES.duel.matrixBonus;
      const pw = panther ? pBeat(dr + b, def) : cols.bote * pBeat(dr + b, def) + cols.conter * pBeat(dr, def + b) + cols.outra * pBeat(dr + b, def);
      p *= pw;
    }
  }
  // corpos no caminho bloqueiam
  const blocked = path.some((c) => enemies(w, true).some((e) => eq(w.pos[e], c)));
  return { p: clamp(p), duels: [...seen], end: blocked ? from : to };
}

/**
 * Chance de manter a bola nos duelos do passo 0 (portador que já começa na zona).
 * Só há duelo se o defensor escolher Bote ou Conter. `row` segue a matriz.
 */
export function contactKeep(w: World, id: string, pos: Cell, row: 'conducao' | 'passar'): number {
  let keep = 1;
  const b = MATCH_RULES.duel.matrixBonus;
  for (const e of zoneOwners(w, pos)) {
    const cols = defenderColumns(w, e);
    const def = attr(w, e, 'defesa');
    const stat = row === 'passar' ? attr(w, id, 'passe') : attr(w, id, 'drible');
    const pBote = row === 'passar' ? pBeat(stat + b, def) : pBeat(stat, def);
    const pConter = pBeat(stat, def);
    keep *= cols.outra + cols.bote * pBote + cols.conter * pConter;
  }
  return clamp(keep);
}

/** Conduzir: para na borda da primeira zona adversária. */
export function carryEnd(w: World, from: Cell, to: Cell, ignoreZones = false): Cell {
  if (ignoreZones) return to;
  const startInZone = zoneOwners(w, from).length > 0;
  let cur = from;
  for (const c of stepPath(from, to)) {
    if (!startInZone && zoneOwners(w, c).length) break;
    if (w.state.order.some((id) => eq(w.pos[id], c))) break;
    cur = c;
  }
  return cur;
}

/** Pressão sobre o portador numa casa: chance de perder a bola no próximo contato. */
export function pressureRisk(w: World, id: string, c: Cell, protecting = false): number {
  let keep = 1;
  for (const e of enemies(w)) {
    const d = cheb(w.pos[e], c);
    if (d > 2) continue;
    const reach = d <= 1 ? 1 : 0.45;
    const cols = defenderColumns(w, e);
    const stat = protecting ? attr(w, id, 'fisico') + MATCH_RULES.duel.protectBonus : attr(w, id, 'drible');
    const def = attr(w, e, 'defesa');
    const pLose = (cols.bote + cols.conter) * (1 - pBeat(stat, def + (protecting ? MATCH_RULES.duel.matrixBonus * cols.bote : 0)));
    keep *= 1 - reach * pLose * 0.8;
  }
  return clamp(1 - keep);
}

/** Chance de gol chutando de `from` na zona `zone`. */
export function shotEstimate(w: World, id: string, from: Cell, zone: GoalZone, bonus = 0, noKeeperZone = false): number {
  const s = w.state;
  const f = s.setup.field;
  const gx = attackingGoalX(w.team, f);
  const dist = distToCells(from, goalCells(gx, f));
  const R = MATCH_RULES.shot;
  const distPen = (dist > R.freeDistance ? Math.ceil((dist - R.freeDistance) / R.penaltyEvery) : 0) + rowsOutsideGoal(from, f) * R.anglePenaltyPerRow;
  const lineCells = line(from, goalCenter(gx, f)).slice(1);
  const onLine = enemies(w).filter((e) => lineCells.some((c) => eq(c, w.pos[e]))).length;
  const shot = attr(w, id, 'chute') - distPen - onLine * R.defenderOnLinePenalty + bonus;
  const keeper = s.order.find((k) => s.players[k].team !== w.team && s.players[k].isKeeper);
  if (!keeper) return 0.95;
  const ka = effectiveAttrs(s, keeper);
  const kb = Math.floor((ka.fisico + ka.visao) / 2) - rollPenalty(s, keeper);
  if (noKeeperZone) return pBeat(shot, kb);
  const kz = predictKeeperZone(w.model, keeper);
  let p = 0;
  for (const [k, pk] of Object.entries(kz)) {
    const z = Number(k) as GoalZone;
    const zb = z === zone ? R.keeperExactZone : zonesAdjacent(z, zone) ? R.keeperAdjacentZone : 0;
    p += pk * pBeat(shot, kb + zb);
  }
  return clamp(p);
}

/** Melhor zona de chute contra as tendências do goleiro, com mistura. */
export function zoneScores(w: World, id: string, from: Cell, bonus = 0): { zone: GoalZone; p: number }[] {
  return ([0, 1, 2, 3, 4, 5] as GoalZone[]).map((z) => ({ zone: z, p: shotEstimate(w, id, from, z, bonus) }));
}

export function distanceToGoal(state: MatchState, c: Cell, team: Team): number {
  const f = state.setup.field;
  return distToCells(c, goalCells(attackingGoalX(team, f), f));
}

export function distanceToOwnGoal(state: MatchState, c: Cell, team: Team): number {
  const f = state.setup.field;
  return distToCells(c, goalCells(ownGoalX(team, f), f));
}

/** Última linha adversária (o defensor de linha mais recuado). */
export function lastLineX(w: World): number {
  const f = w.state.setup.field;
  const dir = w.team === 'A' ? 1 : -1;
  let best = w.team === 'A' ? 0 : f.width - 1;
  for (const e of enemies(w)) {
    const x = w.pos[e].x;
    if (dir * x > dir * best) best = x;
  }
  return best;
}
