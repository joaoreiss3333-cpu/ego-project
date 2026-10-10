import { defaultLoadout, getLineage, allTreeNodes, type Attrs, type Difficulty, type MatchMode, type Personality, type Position } from '@ego/content';
import type { Cell } from './grid';
import { buildSetup, createMatch } from './setup';
import type { MatchState, Plan, SlotSetup, Team } from './types';

export function attrs(v: Partial<Attrs> = {}, base = 5): Attrs {
  return { velocidade: base, drible: base, passe: base, chute: base, fisico: base, visao: base, defesa: base, ...v };
}

export interface SlotOpts {
  id: string;
  team: Team;
  isKeeper?: boolean;
  name?: string;
  lineageId?: string;
  attrs?: Partial<Attrs>;
  base?: number;
  nodes?: string[] | 'all';
  active?: string[];
  flow?: string | null;
  isBot?: boolean;
  difficulty?: Difficulty;
  personality?: Personality;
  position?: Position;
  mastery?: Record<string, number>;
}

export function slot(o: SlotOpts): SlotSetup {
  const lineageId = o.lineageId ?? 'kuon';
  const l = getLineage(lineageId);
  const nodes = o.nodes === 'all' ? allTreeNodes(l).map((n) => n.id) : (o.nodes ?? []);
  const lo = defaultLoadout(lineageId, nodes);
  return {
    id: o.id,
    team: o.team,
    isKeeper: !!o.isKeeper,
    name: o.name ?? o.id,
    number: 10,
    characterId: null,
    isBot: o.isBot ?? false,
    position: o.position ?? (o.isKeeper ? 'goleiro' : 'meio'),
    lineageId,
    level: 10,
    attrs: attrs(o.attrs, o.base ?? 5),
    nodes,
    loadout: { active: o.active ?? lo.active, flow: o.flow === undefined ? lo.flow : o.flow },
    mastery: o.mastery ?? {},
    personality: o.personality ?? 'coletivo',
    difficulty: o.difficulty ?? 'regular',
    color: o.team === 'A' ? '#1F6BFF' : '#F2F4F8',
  };
}

export function makeMatch(mode: MatchMode, slots: SlotSetup[], seed = 'test', extra: { turnsPerHalf?: number; halves?: number; firstTo?: number | null } = {}): MatchState {
  const setup = buildSetup({ id: 'm', seed, mode, kind: 'simulacao', slots, ...extra });
  return createMatch(setup);
}

/** Coloca jogadores em casas específicas e define o portador. */
export function place(state: MatchState, pos: Record<string, Cell>, holder?: string | null): MatchState {
  for (const [id, c] of Object.entries(pos)) state.players[id].pos = { ...c };
  if (holder !== undefined) {
    state.ball.holder = holder;
    if (holder) state.ball.pos = { ...state.players[holder].pos };
  }
  return state;
}

export function plan(playerId: string, dest: Cell, action: Plan['action'], extra: Partial<Plan> = {}): Plan {
  return { playerId, dest, action, ...extra };
}

/** Partida 1v1 padrão com goleiros. */
export function duelSetup(a: Partial<SlotOpts> = {}, b: Partial<SlotOpts> = {}, seed = 'test'): MatchState {
  return makeMatch(
    '1v1',
    [
      slot({ id: 'A1', team: 'A', ...a }),
      slot({ id: 'AGK', team: 'A', isKeeper: true }),
      slot({ id: 'B1', team: 'B', ...b }),
      slot({ id: 'BGK', team: 'B', isKeeper: true }),
    ],
    seed,
  );
}
