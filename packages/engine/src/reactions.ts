import { findSkill, type ActionKind, type SkillEffect } from '@ego/content';
import { cheb, type Cell } from './grid';
import { devourSource, hasStatus, legalActions, skillFor } from './mechanics';
import { validatePlan } from './plan';
import { slotOf } from './setup';
import type { MatchState, Plan, PlanMap } from './types';

export interface RevealedInfo {
  playerId: string;
  dest?: Cell;
  action?: ActionKind;
}

export interface ReactionRequest {
  playerId: string;
  skillId: string;
  effect: SkillEffect;
  revealed: RevealedInfo[];
  allowDest: boolean;
  allowAction: boolean;
  /** Improviso: só troca a ação de bola. */
  ballActionOnly: boolean;
  /** Arranque Tardio: escolhe o destino com metade do movimento. */
  lateMove: boolean;
}

const REACTION_EFFECTS: SkillEffect[] = ['spatial_read', 'metavision', 'peek_carrier_action', 'ego_awake', 'perfect_ginga', 'improvise', 'late_move'];

function nearestEnemies(state: MatchState, id: string, n: number): string[] {
  const p = state.players[id];
  return state.order
    .filter((o) => state.players[o].team !== p.team)
    .sort((a, b) => cheb(state.players[a].pos, p.pos) - cheb(state.players[b].pos, p.pos) || state.order.indexOf(a) - state.order.indexOf(b))
    .slice(0, n);
}

/** Habilidades de reação que este plano (ou efeitos ativos) liberam. */
function reactionSkillsFor(state: MatchState, id: string, plan: Plan): string[] {
  const out: string[] = [];
  const slot = slotOf(state, id);
  const p = state.players[id];
  if (plan.skill) {
    let sid: string | null = plan.skill;
    const def = findSkill(sid);
    if (def?.effect === 'devour') sid = devourSource(state, id);
    const d2 = sid ? findSkill(sid) : undefined;
    if (d2 && REACTION_EFFECTS.includes(d2.effect)) out.push(d2.id);
  }
  if (plan.useFlow && slot.loadout.flow) {
    const def = findSkill(slot.loadout.flow);
    if (def && REACTION_EFFECTS.includes(def.effect)) out.push(def.id);
  }
  // efeitos de Flow que duram mais de um lance
  if (hasStatus(p, 'ego_awake', state.turn) && !out.includes('ego_desperto')) out.push('ego_desperto');
  if (hasStatus(p, 'perfect_ginga', state.turn) && !out.includes('ginga_perfeita')) out.push('ginga_perfeita');
  return out;
}

/**
 * Pedidos de reação depois da revelação. Cada pedido traz só a informação que
 * a habilidade revela; a IA e o bot usam exatamente o mesmo dado.
 */
export function getReactionRequests(state: MatchState, plans: PlanMap): ReactionRequest[] {
  const out: ReactionRequest[] = [];
  for (const id of state.order) {
    const plan = plans[id];
    if (!plan) continue;
    for (const sid of reactionSkillsFor(state, id, plan)) {
      const def = findSkill(sid)!;
      const r = skillFor(state, id, sid);
      const req: ReactionRequest = {
        playerId: id,
        skillId: sid,
        effect: def.effect,
        revealed: [],
        allowDest: false,
        allowAction: false,
        ballActionOnly: false,
        lateMove: false,
      };
      const reveal = (ids: string[], dest: boolean, action: boolean) => {
        for (const o of ids) req.revealed.push({ playerId: o, dest: dest ? plans[o]?.dest : undefined, action: action ? plans[o]?.action : undefined });
      };
      switch (def.effect) {
        case 'spatial_read':
          reveal(nearestEnemies(state, id, r.params.targets ?? 1), true, true);
          req.allowDest = true;
          break;
        case 'metavision':
          reveal(nearestEnemies(state, id, r.params.targets ?? 2), true, true);
          req.allowDest = true;
          req.allowAction = true;
          break;
        case 'peek_carrier_action': {
          const holder = state.ball.holder;
          if (holder && state.players[holder].team !== state.players[id].team) reveal([holder], false, true);
          req.allowDest = true;
          req.allowAction = true;
          break;
        }
        case 'ego_awake': {
          const p = state.players[id];
          const adj = state.order.filter((o) => state.players[o].team !== p.team && cheb(state.players[o].pos, p.pos) <= 1);
          reveal(adj, false, true);
          req.allowAction = true;
          break;
        }
        case 'perfect_ginga': {
          const p = state.players[id];
          reveal(state.order.filter((o) => state.players[o].team !== p.team), true, true);
          req.allowDest = true;
          req.allowAction = true;
          break;
        }
        case 'improvise':
          req.allowAction = true;
          req.ballActionOnly = true;
          break;
        case 'late_move':
          reveal(state.order.filter((o) => o !== id), true, false);
          req.allowDest = true;
          req.lateMove = true;
          break;
        default:
          continue;
      }
      if (req.allowAction || req.allowDest) out.push(req);
    }
  }
  return out;
}

export type ReactionChange = Partial<Pick<Plan, 'dest' | 'action' | 'targetPlayer' | 'targetCell' | 'shotZone' | 'readGuess'>>;

/** Aplica a reação de um jogador, respeitando o que o pedido permite. */
export function applyReaction(state: MatchState, plans: PlanMap, req: ReactionRequest, change: ReactionChange): { plans: PlanMap; error?: string } {
  const cur = plans[req.playerId];
  const next: Plan = { ...cur };
  if (change.dest && req.allowDest) next.dest = change.dest;
  if (change.action && req.allowAction) {
    if (req.ballActionOnly && !legalActions(state, req.playerId).includes(change.action)) return { plans, error: 'Ação inválida.' };
    next.action = change.action;
    next.targetPlayer = change.targetPlayer ?? next.targetPlayer;
    next.targetCell = change.targetCell ?? next.targetCell;
    next.shotZone = change.shotZone ?? next.shotZone;
    next.readGuess = change.readGuess ?? next.readGuess;
  }
  const chk = validatePlan(state, next);
  if (!chk.ok) return { plans, error: chk.error };
  return { plans: { ...plans, [req.playerId]: chk.plan } };
}
