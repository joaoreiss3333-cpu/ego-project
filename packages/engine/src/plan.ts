import { MATCH_RULES, findSkill, type ActionKind, type GoalZone, type ReadGuess } from '@ego/content';
import { cheb, eq, inBounds, isInArea, type Cell } from './grid';
import {
  BALL_ACTIONS,
  legalActions,
  planMoveRange,
  requirementProblem,
  skillOptions,
  staminaCostOfPlan,
} from './mechanics';
import { slotOf } from './setup';
import type { MatchState, Plan, PlanMap } from './types';

export interface PlanCheck {
  ok: boolean;
  plan: Plan;
  error?: string;
}

const ZONES: GoalZone[] = [0, 1, 2, 3, 4, 5];
const GUESSES: ReadGuess[] = ['passe', 'drible', 'chute', 'proteger'];

export function stayPlan(state: MatchState, id: string): Plan {
  const p = state.players[id];
  const carrier = state.ball.holder === id;
  let action: ActionKind = p.isKeeper ? 'gk_posicionar' : carrier ? 'proteger' : 'mover';
  if (p.isKeeper && carrier) action = 'proteger';
  return { playerId: id, dest: { ...p.pos }, action, keeperZone: p.isKeeper ? 1 : null, auto: true };
}

/** Quais alvos a ação precisa. */
export function actionNeeds(action: ActionKind): 'ally' | 'enemy' | 'cell' | 'zone' | 'guess' | 'none' {
  switch (action) {
    case 'passe_pe':
    case 'tabela':
    case 'gk_comandar':
      return 'ally';
    case 'marcar':
    case 'corta_luz':
      return 'enemy';
    case 'passe_espaco':
      return 'cell';
    case 'chutar':
    case 'finalizar_primeira':
      return 'zone';
    case 'leitura':
      return 'guess';
    default:
      return 'none';
  }
}

/**
 * Valida e normaliza um plano. Planos inválidos voltam com `ok: false` e a
 * mensagem para o jogador; a resolução usa `stayPlan` no lugar.
 */
export function validatePlan(state: MatchState, raw: Plan): PlanCheck {
  const id = raw.playerId;
  const p = state.players[id];
  if (!p) return { ok: false, plan: raw, error: 'Jogador não está na partida.' };
  const plan: Plan = { ...raw, dest: { ...raw.dest } };
  const f = state.setup.field;
  const actions = legalActions(state, id);
  if (!actions.includes(plan.action)) return { ok: false, plan, error: 'Essa ação não está disponível agora.' };

  if (!inBounds(plan.dest, f)) return { ok: false, plan, error: 'Destino fora do campo.' };
  if (p.isKeeper && !isInArea(plan.dest, p.team, f)) return { ok: false, plan, error: 'O goleiro não sai da área.' };
  if (plan.action === 'proteger' && !eq(plan.dest, p.pos)) plan.dest = { ...p.pos };
  const range = planMoveRange(state, id, plan);
  if (cheb(p.pos, plan.dest) > range) return { ok: false, plan, error: 'Destino fora do alcance.' };

  const slot = slotOf(state, id);
  const needs = actionNeeds(plan.action);
  if (needs === 'ally') {
    const t = plan.targetPlayer ? state.players[plan.targetPlayer] : undefined;
    if (!t || t.team !== p.team || t.id === id) return { ok: false, plan, error: 'Escolha um aliado.' };
  }
  if (needs === 'enemy') {
    const t = plan.targetPlayer ? state.players[plan.targetPlayer] : undefined;
    if (!t || t.team === p.team || t.isKeeper) return { ok: false, plan, error: 'Escolha um adversário.' };
    if (plan.action === 'corta_luz' && cheb(t.pos, p.pos) > 1) return { ok: false, plan, error: 'O corta-luz precisa de um adversário adjacente.' };
  }
  if (needs === 'cell') {
    if (!plan.targetCell || !inBounds(plan.targetCell, f)) return { ok: false, plan, error: 'Escolha a casa do passe.' };
  }
  if (needs === 'zone' && (plan.shotZone === null || plan.shotZone === undefined || !ZONES.includes(plan.shotZone)))
    plan.shotZone = 1;
  if (needs === 'guess' && (!plan.readGuess || !GUESSES.includes(plan.readGuess))) return { ok: false, plan, error: 'Escolha o que você vai ler.' };
  if (p.isKeeper && (plan.keeperZone === null || plan.keeperZone === undefined)) plan.keeperZone = 1;

  if (plan.sprint && p.stamina < MATCH_RULES.stamina.sprintCost) plan.sprint = false;

  if (plan.skill) {
    const def = findSkill(plan.skill);
    if (!def || def.kind !== 'active' || !slot.loadout.active.includes(plan.skill))
      return { ok: false, plan, error: 'Habilidade fora do loadout.' };
    const opt = skillOptions(state, id, plan.action).find((o) => o.skillId === plan.skill);
    if (!opt?.usable) return { ok: false, plan, error: opt?.reason ?? 'Habilidade indisponível.' };
    const reqProblem = requirementProblem(state, id, plan.skill, plan.action);
    if (reqProblem) return { ok: false, plan, error: reqProblem };
    if (def.target === 'ally') {
      const t = plan.skillTarget ? state.players[plan.skillTarget] : undefined;
      if (!t || t.team !== p.team || t.id === id) {
        // alvo padrão: aliado de linha mais próximo
        const ally = state.order
          .map((x) => state.players[x])
          .filter((x) => x.team === p.team && x.id !== id && !x.isKeeper)
          .sort((a, b) => cheb(a.pos, p.pos) - cheb(b.pos, p.pos))[0];
        if (!ally) return { ok: false, plan, error: 'Sem aliado para a habilidade.' };
        plan.skillTarget = ally.id;
      }
    }
  }
  if (plan.useFlow) {
    if (!slot.loadout.flow || p.flow < MATCH_RULES.flow.max) plan.useFlow = false;
    else {
      const prob = requirementProblem(state, id, slot.loadout.flow, plan.action);
      if (prob) return { ok: false, plan, error: prob };
    }
  }
  if (staminaCostOfPlan(state, id, plan) > p.stamina) return { ok: false, plan, error: 'Fôlego insuficiente para esse plano.' };
  return { ok: true, plan };
}

/** Preenche planos que faltam e troca inválidos por "ficar parado". */
export function normalizePlans(state: MatchState, plans: PlanMap): PlanMap {
  const out: PlanMap = {};
  for (const id of state.order) {
    const raw = plans[id];
    if (!raw) {
      out[id] = stayPlan(state, id);
      continue;
    }
    const chk = validatePlan(state, raw);
    out[id] = chk.ok ? chk.plan : { ...stayPlan(state, id), auto: raw.auto };
  }
  return out;
}

/**
 * Casas candidatas para passe no espaço (numeradas no painel).
 * Casas perto dos aliados e à frente deles, no máximo 20.
 */
export function passSpaceCandidates(state: MatchState, id: string, max = 20): Cell[] {
  const p = state.players[id];
  const f = state.setup.field;
  const dir = p.team === 'A' ? 1 : -1;
  const seen = new Set<string>();
  const scored: { c: Cell; s: number }[] = [];
  for (const aid of state.order) {
    const a = state.players[aid];
    if (a.team !== p.team || a.id === id || a.isKeeper) continue;
    for (let dx = -1; dx <= 3; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const c = { x: a.pos.x + dx * dir, y: a.pos.y + dy };
        if (!inBounds(c, f)) continue;
        const k = `${c.x},${c.y}`;
        if (seen.has(k) || eq(c, p.pos)) continue;
        seen.add(k);
        const forward = (c.x - p.pos.x) * dir;
        const s = forward * 2 - Math.abs(dy) - Math.abs(dx - 1) * 0.5;
        scored.push({ c, s });
      }
  }
  scored.sort((a, b) => b.s - a.s);
  return scored
    .slice(0, max)
    .map((x) => x.c)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function isBallAction(a: ActionKind): boolean {
  return (BALL_ACTIONS as ActionKind[]).includes(a);
}
