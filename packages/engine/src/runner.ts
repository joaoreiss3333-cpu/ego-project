import { planBots, reactBot, type BotOverride, type TeamDebug } from './ai';
import { normalizePlans } from './plan';
import { applyReaction, getReactionRequests, type ReactionChange, type ReactionRequest } from './reactions';
import { resolveTurn } from './resolve';
import { publicRevelation } from './revelation';
import { createMatch } from './setup';
import type { MatchSetup, MatchState, PlanMap, TurnResult } from './types';

export interface AutoTurnOptions {
  /** Planos dos humanos que planejaram a tempo. */
  humanPlans?: PlanMap;
  /** Jogadores controlados pela IA desde o início. */
  botIds: string[];
  /** Humanos que não planejaram: a IA assume (Regular, Cauteloso, sem Flow). */
  afkIds?: string[];
  afkOverride?: BotOverride;
  /** Reação dos humanos (null = mantém o plano). */
  humanReact?: (req: ReactionRequest) => ReactionChange | null;
}

export interface AutoTurnOut {
  result: TurnResult;
  debug: TeamDebug[];
  reactions: ReactionRequest[];
  finalPlans: PlanMap;
}

/** Monta os planos da IA, roda a janela de reação e resolve o lance. */
export function autoTurn(state: MatchState, o: AutoTurnOptions): AutoTurnOut {
  const afk = o.afkIds ?? [];
  const overrides: Record<string, BotOverride> = {};
  for (const id of afk) overrides[id] = o.afkOverride ?? { difficulty: 'regular', personality: 'cauteloso', noFlow: true };
  const ai = planBots(state, [...o.botIds, ...afk], overrides);
  let plans = normalizePlans(state, { ...ai.plans, ...(o.humanPlans ?? {}) });
  const reactions = getReactionRequests(state, plans);
  if (reactions.length) {
    const rev = publicRevelation(state, plans);
    for (const req of reactions) {
      const isBot = o.botIds.includes(req.playerId) || afk.includes(req.playerId);
      if (isBot) plans = reactBot(state, plans, req, rev, overrides[req.playerId]);
      else if (o.humanReact) {
        const ch = o.humanReact(req);
        if (ch) plans = applyReaction(state, plans, req, ch).plans;
      }
    }
  }
  const result = resolveTurn(state, plans);
  return { result, debug: ai.debug, reactions, finalPlans: result.plans };
}

/** Reproduz uma partida a partir da seed e das entradas salvas de cada lance. */
export function replay(setup: MatchSetup, turns: PlanMap[]): { states: MatchState[]; results: TurnResult[] } {
  let s = createMatch(setup);
  const states = [s];
  const results: TurnResult[] = [];
  for (const plans of turns) {
    if (s.finished) break;
    const r = resolveTurn(s, plans);
    results.push(r);
    s = r.state;
    states.push(s);
  }
  return { states, results };
}

/** Simula uma partida inteira só com bots. */
export function simulate(setup: MatchSetup, maxTurns = 200): { state: MatchState; results: TurnResult[]; turns: PlanMap[] } {
  let s = createMatch(setup);
  const botIds = setup.slots.map((x) => x.id);
  const results: TurnResult[] = [];
  const turns: PlanMap[] = [];
  for (let i = 0; i < maxTurns && !s.finished; i++) {
    const out = autoTurn(s, { botIds });
    results.push(out.result);
    turns.push(out.finalPlans);
    s = out.result.state;
  }
  return { state: s, results, turns };
}
