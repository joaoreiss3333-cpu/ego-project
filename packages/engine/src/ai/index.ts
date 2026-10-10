import type { Difficulty, Personality } from '@ego/content';
import type { ReactionRequest } from '../reactions';
import { applyReaction } from '../reactions';
import type { PublicArrow } from '../revelation';
import { Rng } from '../rng';
import { slotOf } from '../setup';
import type { MatchState, Plan, PlanMap, Team } from '../types';
import { chooseCombo, chooseTeamPlan, ROLE_LABEL, TEAM_PLAN_LABEL, type TeamDecision } from './coordinator';
import { decide, type ScoredOption } from './decide';
import { makeWorld } from './evaluate';
import { keeperDecide } from './keeper';
import { buildModel } from './model';
import { DIFFICULTY, PERSONALITY } from './profile';

export interface BotOverride {
  difficulty?: Difficulty;
  personality?: Personality;
  /** AFK: não gasta Flow do jogador. */
  noFlow?: boolean;
}

export interface BotDebug {
  playerId: string;
  name: string;
  role: string;
  options: ScoredOption[];
  ms: number;
}

export interface TeamDebug {
  team: Team;
  plan: string;
  combo: string | null;
  bots: BotDebug[];
}

/** RNG da IA separado do RNG da partida: decisões reproduzíveis sem mexer no motor. */
function aiRng(state: MatchState, id: string, salt = ''): Rng {
  return Rng.fromSeed(`${state.setup.seed}:ai:${state.turn}:${id}:${salt}`);
}

function teamDifficulty(state: MatchState, ids: string[], overrides: Record<string, BotOverride>): Difficulty {
  const order: Difficulty[] = ['novato', 'regular', 'elite', 'chefe'];
  let best = 0;
  for (const id of ids) {
    const d = overrides[id]?.difficulty ?? slotOf(state, id).difficulty;
    best = Math.max(best, order.indexOf(d));
  }
  return order[best];
}

/**
 * Planeja todos os bots de um time no lance. Usa só o estado público
 * (posições, histórico revelado): nunca recebe os planos dos humanos.
 */
export function planTeam(
  state: MatchState,
  team: Team,
  botIds: string[],
  overrides: Record<string, BotOverride> = {},
): { plans: PlanMap; debug: TeamDebug; decision: TeamDecision } {
  const ids = botIds.filter((id) => state.players[id]?.team === team);
  const diff = teamDifficulty(state, ids, overrides);
  const profile = DIFFICULTY[diff];
  const model = buildModel(state, team, profile);
  const w = makeWorld(state, team, model);
  const decision = chooseTeamPlan(w, ids);
  // personalidade do time para combos: média simples pelo primeiro bot
  const firstPers = ids.length ? (overrides[ids[0]]?.personality ?? slotOf(state, ids[0]).personality) : 'coletivo';
  decision.combo = chooseCombo(w, decision, ids.filter((id) => !state.players[id].isKeeper), profile, PERSONALITY[firstPers], aiRng(state, team, 'combo'));

  const plans: PlanMap = {};
  const bots: BotDebug[] = [];
  // o portador decide primeiro; os companheiros bots jogam em cima do plano dele
  const holder = state.ball.holder;
  const ordered = holder && ids.includes(holder) ? [holder, ...ids.filter((x) => x !== holder)] : ids;
  for (const id of ordered) {
    const t0 = Date.now();
    const slot = slotOf(state, id);
    const ov = overrides[id] ?? {};
    const prof = DIFFICULTY[ov.difficulty ?? slot.difficulty];
    const pers = PERSONALITY[ov.personality ?? slot.personality];
    const rng = aiRng(state, id);
    const res = state.players[id].isKeeper
      ? keeperDecide(w, id, prof, rng)
      : decide({ w, id, profile: prof, personality: pers, team: decision, rng, noFlow: ov.noFlow });
    plans[id] = { ...res.plan, auto: true };
    if (id === holder && !state.players[id].isKeeper) decision.carrierPlan = plans[id];
    bots.push({ playerId: id, name: slot.name, role: ROLE_LABEL[decision.roles[id] ?? 'cobertura'], options: res.options, ms: Date.now() - t0 });
  }
  return {
    plans,
    decision,
    debug: { team, plan: TEAM_PLAN_LABEL[decision.plan], combo: decision.combo?.name ?? null, bots },
  };
}

/** Planeja todos os bots dos dois times. */
export function planBots(state: MatchState, botIds: string[], overrides: Record<string, BotOverride> = {}): { plans: PlanMap; debug: TeamDebug[] } {
  const a = planTeam(state, 'A', botIds, overrides);
  const b = planTeam(state, 'B', botIds, overrides);
  return { plans: { ...a.plans, ...b.plans }, debug: [a.debug, b.debug] };
}

/** Configuração da substituição por AFK: Regular, Cauteloso, sem gastar Flow. */
export const AFK_OVERRIDE: BotOverride = { difficulty: 'regular', personality: 'cauteloso', noFlow: true };

/**
 * Reação de um bot na janela entre revelação e resolução. Usa a revelação
 * pública e o que a própria habilidade revelou (req.revealed).
 */
export function reactBot(state: MatchState, plans: PlanMap, req: ReactionRequest, revelation: PublicArrow[], override: BotOverride = {}): PlanMap {
  const id = req.playerId;
  const team = state.players[id].team;
  const slot = slotOf(state, id);
  const prof = DIFFICULTY[override.difficulty ?? slot.difficulty];
  const model = buildModel(state, team, prof);
  const w = makeWorld(state, team, model);
  // destinos públicos da revelação e o que a habilidade mostrou
  for (const a of revelation) if (state.players[a.playerId].team !== team) w.pos[a.playerId] = { ...a.dest };
  for (const r of req.revealed) {
    if (r.dest) w.pos[r.playerId] = { ...r.dest };
    if (r.action) w.knownAction[r.playerId] = r.action;
  }
  const decision = chooseTeamPlan(w, [id]);
  const base = plans[id];
  const res = decide({
    w,
    id,
    profile: prof,
    personality: PERSONALITY[override.personality ?? slot.personality],
    team: decision,
    rng: aiRng(state, id, 'react'),
    noFlow: true,
    restrict: { base, allowDest: req.allowDest, allowAction: req.allowAction, ballActionOnly: req.ballActionOnly },
    revelation,
  });
  const change: Partial<Plan> = {};
  if (req.allowDest) change.dest = res.plan.dest;
  if (req.allowAction) {
    change.action = res.plan.action;
    change.targetPlayer = res.plan.targetPlayer;
    change.targetCell = res.plan.targetCell;
    change.shotZone = res.plan.shotZone;
    change.readGuess = res.plan.readGuess;
  }
  const out = applyReaction(state, plans, req, change);
  return out.plans;
}

export { DIFFICULTY, PERSONALITY, TEAM_PLAN_LABEL, ROLE_LABEL };
export type { TeamDecision, ScoredOption };
