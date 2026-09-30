import {
  ATTRS,
  MASTERY,
  MATCH_RULES,
  findSkill,
  masteryLevel,
  resolveSkill,
  type ActionKind,
  type Attrs,
  type BallAction,
  type ReadGuess,
  type ResolvedSkill,
} from '@ego/content';
import { cellsWithin, isInArea, type Cell } from './grid';
import { slotOf } from './setup';
import type { MatchState, Plan, PlayerState, Status, StatusKind, Team } from './types';

export function hasStatus(p: PlayerState, kind: StatusKind, turn: number): Status | undefined {
  return p.statuses.find((s) => s.kind === kind && s.from <= turn && s.until >= turn);
}

export function addStatus(p: PlayerState, st: Status): void {
  // um status do mesmo tipo é substituído pelo mais longo
  const existing = p.statuses.find((s) => s.kind === st.kind && s.until >= st.from);
  if (existing) {
    existing.from = Math.min(existing.from, st.from);
    existing.until = Math.max(existing.until, st.until);
    existing.value = st.value ?? existing.value;
    existing.data = st.data ?? existing.data;
    return;
  }
  p.statuses.push(st);
}

/** Atributos efetivos no lance (base + equipamentos + efeitos ativos). */
export function effectiveAttrs(state: MatchState, id: string, turn = state.turn): Attrs {
  const slot = slotOf(state, id);
  const p = state.players[id];
  const out = { ...slot.attrs };
  const allPlus = hasStatus(p, 'all_plus', turn);
  if (allPlus) for (const k of ATTRS) out[k] += allPlus.value ?? 1;
  const ego = hasStatus(p, 'ego_awake', turn);
  if (ego) {
    out.visao += ego.value ?? 2;
    out.chute += ego.value ?? 2;
  }
  return out;
}

/** -1 em tudo com fôlego baixo, -1 para quem foi deixado pelo desmarque. */
export function rollPenalty(state: MatchState, id: string, turn = state.turn): number {
  const p = state.players[id];
  let pen = 0;
  if (p.stamina < MATCH_RULES.stamina.lowThreshold) pen += MATCH_RULES.stamina.lowPenalty;
  if (hasStatus(p, 'desmarcado', turn)) pen += MATCH_RULES.offBall.desmarqueMarkerPenalty;
  return pen;
}

export function zoneRadius(state: MatchState, id: string, turn = state.turn): number {
  const p = state.players[id];
  if (p.isKeeper) return 0;
  if (hasStatus(p, 'caido', turn)) return 0;
  const z = hasStatus(p, 'zone_radius', turn);
  return z?.value ?? 1;
}

export function zoneCells(state: MatchState, id: string): Cell[] {
  const r = zoneRadius(state, id);
  if (r <= 0) return [];
  const p = state.players[id];
  return cellsWithin(p.pos, r, state.setup.field).filter((c) => !(c.x === p.pos.x && c.y === p.pos.y));
}

export function baseMoveRange(state: MatchState, id: string, turn = state.turn): number {
  const vel = effectiveAttrs(state, id, turn).velocidade;
  return MATCH_RULES.movement.base + Math.floor(vel / MATCH_RULES.movement.velocityDivisor);
}

export function cannotMove(state: MatchState, id: string, turn = state.turn): boolean {
  const p = state.players[id];
  return !!hasStatus(p, 'vendido', turn) || !!hasStatus(p, 'caido', turn);
}

/** Habilidade com evoluções da árvore e desconto de maestria. */
export function skillFor(state: MatchState, id: string, skillId: string): ResolvedSkill {
  const slot = slotOf(state, id);
  const r = resolveSkill(skillId, slot.nodes);
  const lvl = masteryLevel(slot.mastery[skillId] ?? 0);
  return { ...r, stamina: Math.max(0, r.stamina - lvl * MASTERY.staminaReductionPerLevel) };
}

/**
 * Alcance de movimento previsto para um plano.
 * O corta-luz adversário é aplicado na resolução.
 */
export function planMoveRange(state: MatchState, id: string, plan: Pick<Plan, 'sprint' | 'skill' | 'useFlow'>): number {
  if (cannotMove(state, id)) return 0;
  let range = baseMoveRange(state, id);
  const p = state.players[id];
  if (plan.sprint && p.stamina >= MATCH_RULES.stamina.sprintCost) range += MATCH_RULES.movement.sprintBonus;
  let skill = plan.skill ? findSkill(plan.skill) : undefined;
  if (skill?.effect === 'devour') {
    const src = devourSource(state, id);
    skill = src ? findSkill(src) : undefined;
  }
  const slot = slotOf(state, id);
  const flowSkill = plan.useFlow && slot.loadout.flow ? findSkill(slot.loadout.flow) : undefined;
  let mult = 1;
  let min = 0;
  for (const s of [skill, flowSkill]) {
    if (!s) continue;
    const r = s.lineageId === slot.lineageId ? skillFor(state, id, s.id) : resolveSkill(s.id, []);
    if (s.effect === 'extra_move') range += r.params.cells ?? 0;
    if (s.effect === 'panther') mult = r.params.moveMultiplier ?? 2;
    if (s.effect === 'free_jump') min = r.params.cells ?? 3;
  }
  range = Math.max(range * mult, min);
  if (skill?.effect === 'late_move') range = Math.max(1, Math.floor(range * (skill.params.moveFraction ?? 0.5)));
  return range;
}

export function holderTeam(state: MatchState): Team | null {
  return state.ball.holder ? state.players[state.ball.holder].team : null;
}

export function isCarrier(state: MatchState, id: string): boolean {
  return state.ball.holder === id;
}

export const BALL_ACTIONS: BallAction[] = ['conduzir', 'driblar', 'proteger', 'passe_pe', 'passe_espaco', 'chutar', 'tabela'];
export const KEEPER_BALL_ACTIONS: BallAction[] = ['conduzir', 'proteger', 'passe_pe', 'passe_espaco'];
export const ATTACK_ACTIONS: ActionKind[] = ['mover', 'desmarque', 'abrir_linha', 'corta_luz', 'pedir_bola', 'tabela', 'finalizar_primeira'];
export const DEFENSE_ACTIONS: ActionKind[] = ['mover', 'bote', 'conter', 'fechar_linha', 'marcar', 'leitura'];
export const LOOSE_ACTIONS: ActionKind[] = ['mover', 'desmarque', 'pedir_bola', 'conter', 'fechar_linha', 'marcar'];
export const KEEPER_ACTIONS: ActionKind[] = ['gk_posicionar', 'gk_sair', 'gk_adiantar', 'gk_comandar'];

export function isPassAction(a: ActionKind): boolean {
  return a === 'passe_pe' || a === 'passe_espaco' || a === 'tabela';
}

export function guessOf(action: ActionKind): ReadGuess | null {
  switch (action) {
    case 'passe_pe':
    case 'passe_espaco':
    case 'tabela':
      return 'passe';
    case 'driblar':
    case 'conduzir':
      return 'drible';
    case 'chutar':
      return 'chute';
    case 'proteger':
      return 'proteger';
    default:
      return null;
  }
}

/** Ações disponíveis para o jogador no início do lance. */
export function legalActions(state: MatchState, id: string): ActionKind[] {
  const p = state.players[id];
  const holder = state.ball.holder;
  if (p.isKeeper) return holder === id ? KEEPER_BALL_ACTIONS : KEEPER_ACTIONS;
  if (holder === id) return BALL_ACTIONS;
  if (!holder) return LOOSE_ACTIONS;
  return state.players[holder].team === p.team ? ATTACK_ACTIONS : DEFENSE_ACTIONS;
}

/** Casas que o jogador pode escolher como destino, em ordem de leitura (linha a linha). */
export function reachableCells(state: MatchState, id: string, plan: Pick<Plan, 'sprint' | 'skill' | 'useFlow'> = {}): Cell[] {
  const p = state.players[id];
  const range = planMoveRange(state, id, plan);
  const f = state.setup.field;
  let cells = cellsWithin(p.pos, range, f);
  if (p.isKeeper) cells = cells.filter((c) => isInArea(c, p.team, f));
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  return cells;
}

export interface SkillOption {
  skillId: string;
  name: string;
  kind: 'active' | 'flow';
  stamina: number;
  cooldownLeft: number;
  usable: boolean;
  reason: string | null;
  masteryLevel: number;
}

/** Habilidades do loadout com recarga e custo, para o painel de planejamento. */
export function skillOptions(state: MatchState, id: string, action?: ActionKind): SkillOption[] {
  const slot = slotOf(state, id);
  const p = state.players[id];
  const out: SkillOption[] = [];
  const ids = [...slot.loadout.active, ...(slot.loadout.flow ? [slot.loadout.flow] : [])];
  for (const sid of ids) {
    const def = findSkill(sid);
    if (!def) continue;
    const r = skillFor(state, id, sid);
    const readyAt = p.cooldowns[sid] ?? 0;
    const cooldownLeft = Math.max(0, readyAt - state.turn);
    let reason: string | null = null;
    if (def.kind === 'flow') {
      if (p.flow < MATCH_RULES.flow.max) reason = `Flow em ${p.flow}/100`;
    } else {
      if (cooldownLeft > 0) reason = `Recarga: ${cooldownLeft} lance(s)`;
      else if (p.stamina < r.stamina) reason = 'Fôlego insuficiente';
    }
    if (!reason) reason = requirementProblem(state, id, sid, action);
    out.push({
      skillId: sid,
      name: def.name,
      kind: def.kind,
      stamina: r.stamina,
      cooldownLeft,
      usable: !reason,
      reason,
      masteryLevel: masteryLevel(slot.mastery[sid] ?? 0),
    });
  }
  return out;
}

export function requirementProblem(state: MatchState, id: string, skillId: string, action?: ActionKind): string | null {
  const def = findSkill(skillId);
  if (!def) return 'Habilidade desconhecida';
  const req = def.requirement;
  const carrier = isCarrier(state, id);
  const p = state.players[id];
  const ht = holderTeam(state);
  if (req.kind === 'withBall') {
    if (!carrier) return 'Só com a bola';
    if (req.actions && action && !req.actions.includes(action as BallAction)) return `Só com ${req.actions.join(', ')}`;
  }
  if (req.kind === 'withoutBall') {
    if (carrier) return 'Só sem a bola';
    if (req.actions && action && !req.actions.includes(action as never)) return 'Ação incompatível';
  }
  if (req.kind === 'defending') {
    if (!ht || ht === p.team) return 'Só defendendo';
    if (req.actions && action && !req.actions.includes(action as never)) return 'Ação incompatível';
  }
  if (def.effect === 'devour') {
    const src = devourSource(state, id);
    if (!src) return 'Nada para devorar';
    const inner = requirementProblem(state, id, src, action);
    if (inner) return `Devorar (${findSkill(src)?.name}): ${inner}`;
  }
  return null;
}

/** Habilidade que o Devorar copiaria agora. */
export function devourSource(state: MatchState, id: string): string | null {
  const p = state.players[id];
  if (!p.lastDuel || p.lastDuel.turn !== state.turn - 1) return null;
  const opp = state.players[p.lastDuel.opponent];
  if (!opp?.lastSkill) return null;
  const def = findSkill(opp.lastSkill.skillId);
  if (!def || def.kind === 'flow' || def.effect === 'devour') return null;
  return def.id;
}

export function staminaCostOfPlan(state: MatchState, id: string, plan: Plan): number {
  let cost = 0;
  if (plan.sprint) cost += MATCH_RULES.stamina.sprintCost;
  if (plan.action === 'bote') cost += MATCH_RULES.stamina.boteCost;
  if (plan.skill) {
    const def = findSkill(plan.skill);
    if (def && def.kind === 'active') cost += skillFor(state, id, plan.skill).stamina;
  }
  return cost;
}
