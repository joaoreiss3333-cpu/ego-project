import type { AttrKey } from '@ego/content';
import { attackingGoalX, goalCells, goalRows, inBounds, isInArea, key, type Cell } from '../grid';
import { seedState } from '../rng';
import { emptyStats, kickoffPositions } from '../setup';
import type { MatchSetup, SlotSetup, Team } from '../types';
import { TURNOS } from './rules';
import type { TPlayer, TState } from './types';

export const manh = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
export const dirOf = (t: Team): 1 | -1 => (t === 'A' ? 1 : -1);
export const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
export const clone = <T>(x: T): T => structuredClone(x);

export function slotOf(s: TState, id: string): SlotSetup {
  const x = s.setup.slots.find((y) => y.id === id);
  if (!x) throw new Error(`Jogador desconhecido: ${id}`);
  return x;
}

export const nameOf = (s: TState, id: string) => slotOf(s, id).name;
export const attr = (s: TState, id: string, k: AttrKey): number => slotOf(s, id).attrs[k];
/** Bônus de Visão em passes difíceis e interceptações. */
export const visBonus = (s: TState, id: string) => Math.floor(attr(s, id, 'visao') / TURNOS.visionDivisor);

export const isOn = (s: TState, p: TPlayer) => s.round > p.offUntil;
export const playersOn = (s: TState): TPlayer[] => s.order.map((id) => s.players[id]).filter((p) => isOn(s, p));

export function occupant(s: TState, c: Cell): TPlayer | null {
  for (const id of s.order) {
    const p = s.players[id];
    if (isOn(s, p) && same(p.pos, c)) return p;
  }
  return null;
}

export function isGoalCell(s: TState, c: Cell): boolean {
  const f = s.setup.field;
  if (c.x !== 0 && c.x !== f.width - 1) return false;
  return goalRows(f).includes(c.y);
}

export function keeperOf(s: TState, team: Team): TPlayer | null {
  return playersOn(s).find((p) => p.team === team && p.isKeeper) ?? null;
}

export const holderOf = (s: TState): TPlayer | null => (s.ball.holder ? s.players[s.ball.holder] : null);

/** A casa pode receber o jogador `p` (livre, dentro do campo; goleiro só na própria área). */
export function walkable(s: TState, p: TPlayer, c: Cell): boolean {
  const f = s.setup.field;
  if (!inBounds(c, f)) return false;
  const o = occupant(s, c);
  if (o && o.id !== p.id) return false;
  if (p.isKeeper) return isInArea(c, p.team, f);
  return !isGoalCell(s, c);
}

/** Casas alcançáveis com até `range` passos ortogonais por casas livres (sem a casa atual). */
export function reach(s: TState, p: TPlayer, range: number): Cell[] {
  const seen = new Set<string>([key(p.pos)]);
  let frontier: Cell[] = [p.pos];
  const out: Cell[] = [];
  for (let step = 0; step < range; step++) {
    const next: Cell[] = [];
    for (const c of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (seen.has(key(n)) || !walkable(s, p, n)) continue;
        seen.add(key(n));
        next.push(n);
        out.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** Casas entre duas casas alinhadas (mesma linha ou coluna), sem as pontas. `null` se não alinhadas. */
export function between(a: Cell, b: Cell): Cell[] | null {
  if (same(a, b)) return null;
  if (a.x !== b.x && a.y !== b.y) return null;
  const out: Cell[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let x = a.x + dx;
  let y = a.y + dy;
  while (x !== b.x || y !== b.y) {
    out.push({ x, y });
    x += dx;
    y += dy;
  }
  return out;
}

/** Corredor lateral: as 2 linhas mais próximas de cada lateral. */
export const inLane = (s: TState, c: Cell) => c.y <= 1 || c.y >= s.setup.field.height - 2;

/** Distância (em casas ortogonais) até a casa do gol que o time ataca mais próxima. */
export function goalDistance(s: TState, team: Team, c: Cell): number {
  const gx = attackingGoalX(team, s.setup.field);
  return Math.min(...goalCells(gx, s.setup.field).map((g) => manh(c, g)));
}

export function orthNeighbors(c: Cell): Cell[] {
  return [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ];
}

/** Adversários (em campo, jogadores de linha ou goleiro) colados em `p`. */
export function adjacentOpponents(s: TState, p: TPlayer): TPlayer[] {
  return playersOn(s).filter((o) => o.team !== p.team && manh(o.pos, p.pos) === 1);
}

export function currentActorId(s: TState): string {
  return s.freeKick ? s.freeKick.player : s.order[s.cursor];
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/** Ordem de turnos: times intercalados, cada time na ordem de entrada (goleiro por último). */
export function turnOrder(setup: MatchSetup): string[] {
  const lists = (['A', 'B'] as Team[]).map((t) => {
    const mine = setup.slots.filter((x) => x.team === t);
    return [...mine.filter((x) => !x.isKeeper), ...mine.filter((x) => x.isKeeper)].map((x) => x.id);
  });
  const out: string[] = [];
  for (let i = 0; i < Math.max(lists[0].length, lists[1].length); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export function createTurnos(setup: MatchSetup): TState {
  const pos = kickoffPositions(setup, 'A');
  const players: Record<string, TPlayer> = {};
  for (const sl of setup.slots) {
    players[sl.id] = {
      id: sl.id,
      team: sl.team,
      isKeeper: sl.isKeeper,
      pos: { ...pos[sl.id] },
      stats: emptyStats(),
      fouls: 0,
      yellow: 0,
      offUntil: 0,
      fallen: false,
      conter: 0,
      posture: 'posicionar',
      commandAlly: null,
    };
  }
  const holder = setup.slots.find((x) => x.team === 'A' && !x.isKeeper)?.id ?? null;
  return {
    engine: 'turnos',
    setup,
    rng: seedState(setup.seed),
    round: 1,
    half: 1,
    roundInHalf: 1,
    order: turnOrder(setup),
    cursor: 0,
    turnCount: 0,
    score: { A: 0, B: 0 },
    ball: { holder, pos: holder ? { ...pos[holder] } : { x: Math.floor(setup.field.width / 2), y: Math.floor(setup.field.height / 2) } },
    players,
    kickoffTeam: 'A',
    freeKick: null,
    shotHistory: {},
    lastPass: null,
    finished: false,
    winner: null,
  };
}

/** Recoloca todos na formação de saída com a posse de `team`. */
export function kickoff(s: TState, team: Team): void {
  const pos = kickoffPositions(s.setup, team);
  for (const id of s.order) {
    s.players[id].pos = { ...pos[id] };
    s.players[id].fallen = false;
  }
  const holder = s.setup.slots.find((x) => x.team === team && !x.isKeeper && isOn(s, s.players[x.id]))?.id ?? null;
  s.ball = { holder, pos: holder ? { ...pos[holder] } : { x: Math.floor(s.setup.field.width / 2), y: Math.floor(s.setup.field.height / 2) } };
  s.kickoffTeam = team;
  s.lastPass = null;
  s.freeKick = null;
}

/** Entrega a bola ao jogador (a bola passa a estar na casa dele). */
export function giveBall(s: TState, id: string): void {
  s.ball = { holder: id, pos: { ...s.players[id].pos } };
  // a posse mudou de time: o último passe deixa de valer para assistência
  if (s.lastPass && s.players[s.lastPass.passer].team !== s.players[id].team) s.lastPass = null;
}

/** Solta a bola numa casa. Se houver alguém nela, essa pessoa fica com a bola. */
export function dropBall(s: TState, c: Cell): string | null {
  const o = occupant(s, c);
  if (o) {
    giveBall(s, o.id);
    return o.id;
  }
  s.ball = { holder: null, pos: { ...c } };
  return null;
}

/** Quem está na vez depois de `cursor`, pulando quem está fora de campo; vira a rodada quando dá a volta. */
export function advance(s: TState): void {
  s.freeKick = null;
  const n = s.order.length;
  for (let i = 0; i < n * 2 && !s.finished; i++) {
    s.cursor++;
    if (s.cursor >= n) {
      s.cursor = 0;
      endRound(s);
      if (s.finished) return;
    }
    if (isOn(s, s.players[s.order[s.cursor]])) return;
  }
}

function endRound(s: TState): void {
  s.round++;
  s.roundInHalf++;
  if (s.roundInHalf > s.setup.turnsPerHalf) {
    if (s.half >= s.setup.halves) {
      finish(s);
      return;
    }
    s.half++;
    s.roundInHalf = 1;
    kickoff(s, s.half % 2 === 1 ? 'A' : 'B');
  }
}

export function finish(s: TState): void {
  s.finished = true;
  s.winner = s.score.A === s.score.B ? 'draw' : s.score.A > s.score.B ? 'A' : 'B';
}
