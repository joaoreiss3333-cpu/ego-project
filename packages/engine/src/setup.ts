import { FIELD_SIZES, MATCH_RULES, type MatchMode } from '@ego/content';
import { goalCenter, ownGoalX, type Cell } from './grid';
import { seedState } from './rng';
import type { MatchSetup, MatchState, PlayerState, PlayerStats, SlotSetup, Team } from './types';

export function emptyStats(): PlayerStats {
  return {
    goals: 0,
    goalsOneTouch: 0,
    assists: 0,
    shots: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    dribblesWon: 0,
    dribblesLost: 0,
    duelsWon: 0,
    duelsLost: 0,
    tackles: 0,
    interceptions: 0,
    readsCorrect: 0,
    readsWrong: 0,
    saves: 0,
    activeTurns: 0,
    totalTurns: 0,
    skillUses: {},
    flowActivations: 0,
    askedPassesAnswered: 0,
    tabelas: 0,
  };
}

/** Formação de saída: [profundidade atrás do meio, deslocamento lateral]. */
const FORMATIONS: Record<number, [number, number][]> = {
  1: [[2, 0]],
  2: [[2, -1], [3, 1]],
  3: [[2, 0], [3, -2], [4, 2]],
  4: [[2, -1], [2, 2], [4, -2], [4, 1]],
  5: [[2, 0], [3, -3], [3, 3], [5, -1], [5, 1]],
};

export function kickoffPositions(setup: MatchSetup, kickoffTeam: Team): Record<string, Cell> {
  const f = setup.field;
  const midX = Math.floor(f.width / 2);
  const midY = Math.floor(f.height / 2);
  const out: Record<string, Cell> = {};
  for (const team of ['A', 'B'] as Team[]) {
    const outfield = setup.slots.filter((s) => s.team === team && !s.isKeeper);
    const form = FORMATIONS[Math.min(5, Math.max(1, outfield.length))] ?? FORMATIONS[5];
    outfield.forEach((s, i) => {
      const [depth, lat] = form[i % form.length];
      const extra = Math.floor(i / form.length);
      const dir = team === 'A' ? -1 : 1;
      out[s.id] = {
        x: Math.min(f.width - 1, Math.max(0, midX + dir * (depth + extra))),
        y: Math.min(f.height - 1, Math.max(0, midY + lat)),
      };
    });
    if (team === kickoffTeam && outfield.length) out[outfield[0].id] = { x: midX, y: midY };
    const keeper = setup.slots.find((s) => s.team === team && s.isKeeper);
    if (keeper) out[keeper.id] = goalCenter(ownGoalX(team, f), f);
  }
  return out;
}

export interface CreateSetupInput {
  id: string;
  seed: string;
  mode: MatchMode;
  kind: MatchSetup['kind'];
  slots: SlotSetup[];
  quick?: boolean;
  turnsPerHalf?: number;
  halves?: number;
  firstTo?: number | null;
}

export function buildSetup(input: CreateSetupInput): MatchSetup {
  const quick = !!input.quick;
  return {
    id: input.id,
    seed: input.seed,
    mode: input.mode,
    kind: input.kind,
    field: { ...FIELD_SIZES[input.mode] },
    halves: input.halves ?? MATCH_RULES.halves,
    turnsPerHalf: input.turnsPerHalf ?? (quick ? 15 : MATCH_RULES.turnsPerHalf),
    firstTo: input.firstTo !== undefined ? input.firstTo : quick ? MATCH_RULES.quickFirstTo : null,
    slots: input.slots,
  };
}

export function createMatch(setup: MatchSetup): MatchState {
  const kickoffTeam: Team = 'A';
  const pos = kickoffPositions(setup, kickoffTeam);
  const players: Record<string, PlayerState> = {};
  for (const s of setup.slots) {
    players[s.id] = {
      id: s.id,
      team: s.team,
      isKeeper: s.isKeeper,
      pos: pos[s.id],
      stamina: MATCH_RULES.stamina.max,
      flow: 0,
      ego: 0,
      chem: 0,
      cooldowns: {},
      statuses: [],
      rhythm: 0,
      lastDuel: null,
      lastSkill: null,
      stats: emptyStats(),
    };
  }
  const holder = setup.slots.find((s) => s.team === kickoffTeam && !s.isKeeper)?.id ?? null;
  return {
    setup,
    turn: 1,
    half: 1,
    turnInHalf: 1,
    score: { A: 0, B: 0 },
    ball: { holder, pos: holder ? { ...pos[holder] } : { x: Math.floor(setup.field.width / 2), y: Math.floor(setup.field.height / 2) } },
    players,
    order: setup.slots.map((s) => s.id),
    rng: seedState(setup.seed),
    trails: [],
    lastPass: null,
    kickoffTeam,
    history: [],
    finished: false,
    winner: null,
  };
}

/** Recoloca todos na formação de saída com a posse de `team`. */
export function resetForKickoff(state: MatchState, team: Team): void {
  const pos = kickoffPositions(state.setup, team);
  for (const id of state.order) state.players[id].pos = { ...pos[id] };
  const holder = state.setup.slots.find((s) => s.team === team && !s.isKeeper)?.id ?? null;
  state.ball = { holder, pos: holder ? { ...pos[holder] } : state.ball.pos };
  state.trails = [];
  state.lastPass = null;
  state.kickoffTeam = team;
}

export function slotOf(state: MatchState, id: string): SlotSetup {
  const s = state.setup.slots.find((x) => x.id === id);
  if (!s) throw new Error(`Jogador desconhecido: ${id}`);
  return s;
}
