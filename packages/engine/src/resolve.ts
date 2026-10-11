import { ACTION_LABEL, ATTR_LABEL, MATCH_RULES, findSkill, type AttrKey, type GoalZone, type ResolvedSkill } from '@ego/content';
import {
  attackingGoalX,
  cheb,
  distToCells,
  eq,
  goalCells,
  goalCenter,
  inBounds,
  isInArea,
  isStraight,
  key,
  line,
  nearestBorder,
  rowsOutsideGoal,
  stepPath,
  type Cell,
} from './grid';
import {
  addStatus,
  baseMoveRange,
  cannotMove,
  devourSource,
  effectiveAttrs,
  guessOf,
  hasStatus,
  isPassAction,
  skillFor,
  zoneRadius,
} from './mechanics';
import { narrate } from './narrate';
import { normalizePlans } from './plan';
import { Rng } from './rng';
import { resetForKickoff, slotOf } from './setup';
import {
  otherTeam,
  type MatchEvent,
  type MatchState,
  type Plan,
  type PlanMap,
  type RevealedPlan,
  type RollPart,
  type StepFrame,
  type Team,
  type TurnResult,
} from './types';

/** Efeitos de habilidade válidos só neste lance. */
interface TurnFx {
  moveBonus: number;
  moveMult: number;
  minRange: number;
  ignoreZones: boolean;
  tackleBonus: number;
  tackleFailDown: boolean;
  cover: { ally: string; range: number; bonus: number } | null;
  shotBlock: { range: number } | null;
  panther: boolean;
  trail: { minCells: number; turns: number } | null;
  late: { fraction: number } | null;
  speedShot: { minCells: number; maxBonus: number } | null;
  directShot: number;
  puzzle: number;
  samba: { bonus: number; left: number } | null;
  curve: number;
  commandBonus: number;
  /** Habilidades ativadas neste lance (para maestria e Devorar). */
  used: string[];
}

function emptyFx(): TurnFx {
  return {
    moveBonus: 0,
    moveMult: 1,
    minRange: 0,
    ignoreZones: false,
    tackleBonus: 0,
    tackleFailDown: false,
    cover: null,
    shotBlock: null,
    panther: false,
    trail: null,
    late: null,
    speedShot: null,
    directShot: 0,
    puzzle: 0,
    samba: null,
    curve: 0,
    commandBonus: 0,
    used: [],
  };
}

interface Ctx {
  s: MatchState;
  rng: Rng;
  t: number;
  plans: PlanMap;
  events: MatchEvent[];
  frames: StepFrame[];
  paths: Record<string, Cell[]>;
  moved: Record<string, number>;
  init: Record<string, number>;
  initOrder: string[];
  fx: Record<string, TurnFx>;
  readBonus: Record<string, number>;
  dueled: Set<string>;
  stopped: Set<string>;
  carrierStart: string | null;
  attackingTeam: Team | null;
  stolen: boolean;
  goal: Team | null;
  /** Skill usada com sucesso (para maestria). */
  successes: { player: string; skillId: string }[];
  rhythmImmune: string | null;
  ballActionTaken: boolean;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function snapshot(ctx: Ctx): StepFrame {
  const positions: Record<string, Cell> = {};
  for (const id of ctx.s.order) positions[id] = { ...ctx.s.players[id].pos };
  return { positions, ball: { ...ctx.s.ball.pos }, holder: ctx.s.ball.holder };
}

function attr(ctx: Ctx, id: string, k: AttrKey): number {
  return effectiveAttrs(ctx.s, id, ctx.t)[k];
}

/** Rolagem com parcelas nomeadas (a soma é o total), para explicar o lance depois. */
class Roll {
  parts: RollPart[] = [];
  add(label: string, value: number): this {
    if (value) this.parts.push({ label, value });
    return this;
  }
  get total(): number {
    return this.parts.reduce((a, p) => a + p.value, 0);
  }
}

/** Mesmas penalidades de `rollPenalty`, separadas por motivo. */
function addPenalties(ctx: Ctx, id: string, r: Roll) {
  const p = ctx.s.players[id];
  if (p.stamina < MATCH_RULES.stamina.lowThreshold) r.add('fôlego baixo', -MATCH_RULES.stamina.lowPenalty);
  if (hasStatus(p, 'desmarcado', ctx.t)) r.add('perdeu o marcado', -MATCH_RULES.offBall.desmarqueMarkerPenalty);
}

const skillName = (id: string) => findSkill(id)?.name ?? id;

function gainFlow(ctx: Ctx, id: string, amount: number) {
  const p = ctx.s.players[id];
  p.flow = Math.min(MATCH_RULES.flow.max, p.flow + amount);
}

function markSuccess(ctx: Ctx, id: string, skillId: string, note?: string) {
  ctx.successes.push({ player: id, skillId });
  ctx.events.push({ t: 'skill', player: id, skillId, success: true, note });
}

function setHolder(ctx: Ctx, id: string | null, pos?: Cell) {
  ctx.s.ball.holder = id;
  if (id) ctx.s.ball.pos = { ...ctx.s.players[id].pos };
  else if (pos) ctx.s.ball.pos = { ...pos };
}

function enemiesOf(ctx: Ctx, team: Team, includeKeeper = false) {
  return ctx.s.order.map((id) => ctx.s.players[id]).filter((p) => p.team !== team && (includeKeeper || !p.isKeeper));
}

function keeperOf(ctx: Ctx, team: Team) {
  return ctx.s.order.map((id) => ctx.s.players[id]).find((p) => p.team === team && p.isKeeper) ?? null;
}

// ---------------------------------------------------------------------------
// Ativação de habilidades
// ---------------------------------------------------------------------------

function applySkill(ctx: Ctx, id: string, r: ResolvedSkill, plan: Plan) {
  const p = ctx.s.players[id];
  const fx = ctx.fx[id];
  const t = ctx.t;
  const pr = r.params;
  fx.used.push(r.id);
  switch (r.def.effect) {
    case 'stamina_refill_allplus':
      p.stamina = MATCH_RULES.stamina.max;
      addStatus(p, { kind: 'all_plus', from: t, until: t + (pr.turns ?? 2) - 1, value: pr.bonus ?? 1 });
      markSuccess(ctx, id, r.id);
      break;
    case 'extra_move':
      fx.moveBonus += pr.cells ?? 2;
      markSuccess(ctx, id, r.id);
      break;
    case 'tackle_bonus':
      fx.tackleBonus += pr.bonus ?? 2;
      fx.tackleFailDown = true;
      break;
    case 'cover_ally':
      if (plan.skillTarget) fx.cover = { ally: plan.skillTarget, range: pr.range ?? 2, bonus: pr.bonus ?? 2 };
      break;
    case 'zone_radius':
      addStatus(p, { kind: 'zone_radius', from: t, until: t + (pr.turns ?? 2) - 1, value: pr.radius ?? 2 });
      markSuccess(ctx, id, r.id);
      break;
    case 'shot_block':
      fx.shotBlock = { range: pr.range ?? 2 };
      break;
    case 'free_jump':
      fx.minRange = Math.max(fx.minRange, pr.cells ?? 3);
      fx.ignoreZones = true;
      markSuccess(ctx, id, r.id);
      break;
    case 'panther':
      fx.panther = true;
      fx.moveMult = pr.moveMultiplier ?? 2;
      markSuccess(ctx, id, r.id);
      break;
    case 'accel_trail': {
      const range = baseMoveRange(ctx.s, id, t);
      const d = cheb(p.pos, plan.dest);
      if (isStraight(p.pos, plan.dest) && d >= (pr.minCells ?? 4) && d <= range + fx.moveBonus + 10) {
        fx.trail = { minCells: pr.minCells ?? 4, turns: pr.trailTurns ?? 1 };
        fx.ignoreZones = true;
      } else {
        ctx.events.push({ t: 'skill', player: id, skillId: r.id, success: false, note: 'sem linha reta' });
      }
      break;
    }
    case 'late_move':
      fx.late = { fraction: pr.moveFraction ?? 0.5 };
      markSuccess(ctx, id, r.id);
      break;
    case 'speed_shot':
      fx.speedShot = { minCells: pr.minCells ?? 3, maxBonus: pr.maxBonus ?? 4 };
      break;
    case 'ego_awake':
      addStatus(p, { kind: 'ego_awake', from: t, until: t + (pr.turns ?? 2) - 1, value: pr.bonus ?? 2 });
      markSuccess(ctx, id, r.id);
      break;
    case 'spatial_read':
    case 'metavision':
    case 'peek_carrier_action':
    case 'improvise':
      // efeito aplicado na janela de reação (reactions.ts)
      markSuccess(ctx, id, r.id);
      break;
    case 'direct_shot':
      fx.directShot = pr.bonus ?? 3;
      break;
    case 'puzzle_piece':
      fx.puzzle = pr.bonus ?? 6;
      break;
    case 'perfect_ginga':
      addStatus(p, { kind: 'perfect_ginga', from: t, until: t + (pr.turns ?? 1) - 1 });
      p.rhythm = Math.max(p.rhythm, pr.stacks ?? 3);
      markSuccess(ctx, id, r.id);
      break;
    case 'ginga_rhythm':
      addStatus(p, {
        kind: 'rhythm_active',
        from: t,
        until: t + (pr.turns ?? 3) - 1,
        data: { max: pr.maxStacks ?? 3, pass: pr.passGivesStack ?? 0 },
      });
      markSuccess(ctx, id, r.id);
      break;
    case 'samba':
      fx.samba = { bonus: pr.bonus ?? 1, left: pr.duels ?? 2 };
      break;
    case 'curve_pass':
      fx.curve = pr.ignoreDefenders ?? 1;
      break;
    case 'devour':
      break;
  }
}

function activateAll(ctx: Ctx) {
  const s = ctx.s;
  for (const id of s.order) {
    const p = s.players[id];
    const plan = ctx.plans[id];
    const slot = slotOf(s, id);
    // sprint
    if (plan.sprint && p.stamina >= MATCH_RULES.stamina.sprintCost) {
      p.stamina -= MATCH_RULES.stamina.sprintCost;
      ctx.fx[id].moveBonus += MATCH_RULES.movement.sprintBonus;
      ctx.events.push({ t: 'sprint', player: id });
    }
    if (plan.action === 'bote') p.stamina = Math.max(0, p.stamina - MATCH_RULES.stamina.boteCost);
    // Flow
    if (plan.useFlow && slot.loadout.flow && p.flow >= MATCH_RULES.flow.max) {
      p.flow = 0;
      p.stats.flowActivations++;
      const r = skillFor(s, id, slot.loadout.flow);
      ctx.events.push({ t: 'flow', player: id, skillId: r.id });
      applySkill(ctx, id, r, plan);
      p.lastSkill = { skillId: r.id, turn: ctx.t };
    }
    // Ativa
    if (plan.skill) {
      const def = findSkill(plan.skill);
      if (!def || def.kind !== 'active') continue;
      const r = skillFor(s, id, plan.skill);
      const readyAt = p.cooldowns[plan.skill] ?? 0;
      if (readyAt > ctx.t || p.stamina < r.stamina) continue;
      p.stamina -= r.stamina;
      p.cooldowns[plan.skill] = ctx.t + r.cooldown + 1;
      p.lastSkill = { skillId: plan.skill, turn: ctx.t };
      if (def.effect === 'devour') {
        const src = devourSource(s, id);
        if (src) {
          const copied = skillFor(s, id, src);
          markSuccess(ctx, id, plan.skill, copied.name);
          applySkill(ctx, id, copied, plan);
        }
      } else {
        applySkill(ctx, id, r, plan);
      }
    }
  }
  // Comandar do goleiro humano
  for (const id of s.order) {
    const plan = ctx.plans[id];
    if (plan.action === 'gk_comandar' && plan.targetPlayer) {
      const t = s.players[plan.targetPlayer];
      if (t && t.team === s.players[id].team && isInArea(t.pos, t.team, s.setup.field))
        ctx.fx[t.id].commandBonus += MATCH_RULES.goalkeeper.commandBonus;
    }
  }
}

// ---------------------------------------------------------------------------
// Iniciativa e Leitura
// ---------------------------------------------------------------------------

function rollInitiative(ctx: Ctx) {
  for (const id of ctx.s.order) {
    const p = ctx.s.players[id];
    let v = attr(ctx, id, 'velocidade') + ctx.rng.d10();
    if (hasStatus(p, 'read_wrong', ctx.t)) v -= MATCH_RULES.duel.readWrongInitiativePenalty;
    ctx.init[id] = v;
  }
  ctx.initOrder = [...ctx.s.order].sort((a, b) => ctx.init[b] - ctx.init[a] || ctx.s.order.indexOf(a) - ctx.s.order.indexOf(b));
}

function resolveReads(ctx: Ctx) {
  const c = ctx.carrierStart;
  if (!c) return;
  const cp = ctx.s.players[c];
  const cplan = ctx.plans[c];
  const truth = guessOf(cplan.action);
  const passLine: Cell[] = [];
  if (isPassAction(cplan.action)) {
    const target = cplan.action === 'passe_espaco' ? cplan.targetCell : cplan.targetPlayer ? ctx.plans[cplan.targetPlayer]?.dest : null;
    if (target) passLine.push(...line(cplan.dest, target));
  }
  for (const id of ctx.s.order) {
    const plan = ctx.plans[id];
    const p = ctx.s.players[id];
    if (plan.action !== 'leitura' || !plan.readGuess || p.team === cp.team) continue;
    if (ctx.rhythmImmune === c) {
      ctx.events.push({ t: 'read', player: id, guess: plan.readGuess, correct: false, target: c });
      continue;
    }
    const near =
      cheb(p.pos, cp.pos) <= MATCH_RULES.duel.readRange ||
      cheb(plan.dest, cplan.dest) <= MATCH_RULES.duel.readRange ||
      (passLine.length > 0 && distToCells(plan.dest, passLine) <= MATCH_RULES.duel.readRange);
    const correct = plan.readGuess === truth;
    ctx.events.push({ t: 'read', player: id, guess: plan.readGuess, correct: correct && near, target: c });
    if (correct && near) {
      ctx.readBonus[id] = MATCH_RULES.duel.readBonus;
      gainFlow(ctx, id, MATCH_RULES.flow.readCorrect);
      p.stats.readsCorrect++;
    } else if (!correct) {
      p.stats.readsWrong++;
      addStatus(p, { kind: 'read_wrong', from: ctx.t + 1, until: ctx.t + 1 });
    }
  }
}

// ---------------------------------------------------------------------------
// Movimento em passos
// ---------------------------------------------------------------------------

interface Mover {
  id: string;
  path: Cell[];
  idx: number;
  left: number;
  /** Portador que evita zonas (conduzir, passar, chutar). */
  avoidZones: boolean;
}

function inEnemyZone(ctx: Ctx, id: string, cell: Cell): boolean {
  const team = ctx.s.players[id].team;
  for (const e of enemiesOf(ctx, team)) {
    const r = zoneRadius(ctx.s, e.id, ctx.t);
    if (r > 0 && cheb(e.pos, cell) <= r) return true;
  }
  return false;
}

function resolveMarkDest(ctx: Ctx, id: string, plan: Plan, range: number): Cell {
  const target = plan.targetPlayer ? ctx.s.players[plan.targetPlayer] : null;
  if (!target) return plan.dest;
  const tDest = ctx.plans[target.id]?.dest ?? target.pos;
  const p = ctx.s.players[id];
  const f = ctx.s.setup.field;
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const c = { x: tDest.x + dx, y: tDest.y + dy };
      if (!inBounds(c, f)) continue;
      const d = cheb(c, p.pos);
      if (d <= range && d < bestD) {
        best = c;
        bestD = d;
      }
    }
  if (best) return best;
  return tDest;
}

function buildMovers(ctx: Ctx, late: boolean): Mover[] {
  const s = ctx.s;
  const f = s.setup.field;
  const out: Mover[] = [];
  const cortaLuz: Record<string, number> = {};
  for (const id of s.order) {
    const plan = ctx.plans[id];
    if (plan.action === 'corta_luz' && plan.targetPlayer) {
      const t = s.players[plan.targetPlayer];
      if (t && cheb(t.pos, s.players[id].pos) <= 1) cortaLuz[t.id] = (cortaLuz[t.id] ?? 0) + MATCH_RULES.offBall.corteLuzMovePenalty;
    }
  }
  for (const id of ctx.initOrder) {
    const fx = ctx.fx[id];
    if (!!fx.late !== late) continue;
    const p = s.players[id];
    const plan = ctx.plans[id];
    if (cannotMove(s, id, ctx.t)) continue;
    let range = baseMoveRange(s, id, ctx.t) + fx.moveBonus;
    range = Math.max(range * fx.moveMult, fx.minRange);
    if (fx.late) range = Math.max(1, Math.floor(range * fx.late.fraction));
    range = Math.max(0, range - (cortaLuz[id] ?? 0));
    let dest = plan.dest;
    if (plan.action === 'marcar') dest = resolveMarkDest(ctx, id, plan, range);
    if (plan.action === 'proteger') dest = p.pos;
    let path = stepPath(p.pos, dest).slice(0, range);
    if (p.isKeeper) {
      const cut = path.findIndex((c) => !isInArea(c, p.team, f));
      if (cut >= 0) path = path.slice(0, cut);
    }
    if (!path.length) continue;
    const carrier = s.ball.holder === id;
    out.push({ id, path, idx: 0, left: range, avoidZones: carrier && plan.action !== 'driblar' && !fx.ignoreZones });
  }
  return out;
}

function runSteps(ctx: Ctx, movers: Mover[], stepOffset: number) {
  const s = ctx.s;
  const occupied = () => {
    const m = new Map<string, string>();
    for (const id of s.order) m.set(key(s.players[id].pos), id);
    return m;
  };
  let step = stepOffset;
  const maxSteps = movers.reduce((a, m) => Math.max(a, m.left), 0);
  for (let i = 0; i < maxSteps; i++) {
    step++;
    const pending = movers.filter((m) => m.left > 0 && m.idx < m.path.length && !ctx.stopped.has(m.id));
    if (!pending.length) break;
    // portador que evita zonas para na borda
    for (const m of pending) {
      if (!m.avoidZones || s.ball.holder !== m.id) continue;
      const next = m.path[m.idx];
      if (inEnemyZone(ctx, m.id, next) && !inEnemyZone(ctx, m.id, s.players[m.id].pos)) {
        ctx.stopped.add(m.id);
      }
    }
    // resolve ocupação em passadas, respeitando iniciativa
    const unresolved = pending.filter((m) => !ctx.stopped.has(m.id));
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      const occ = occupied();
      for (const m of unresolved) {
        if (done.has(m.id)) continue;
        const next = m.path[m.idx];
        const who = occ.get(key(next));
        if (who && who !== m.id) continue;
        const p = s.players[m.id];
        occ.delete(key(p.pos));
        p.pos = { ...next };
        occ.set(key(next), m.id);
        (ctx.paths[m.id] ??= []).push({ ...next });
        ctx.moved[m.id] = (ctx.moved[m.id] ?? 0) + 1;
        if (s.ball.holder === m.id) s.ball.pos = { ...next };
        m.idx++;
        done.add(m.id);
        progress = true;
      }
    }
    for (const m of unresolved) {
      m.left--;
      if (!done.has(m.id)) ctx.events.push({ t: 'blocked', player: m.id });
    }
    // bola solta: quem pisa pega
    if (!s.ball.holder) {
      const on = s.order.find((id) => eq(s.players[id].pos, s.ball.pos));
      if (on) {
        setHolder(ctx, on);
        ctx.events.push({ t: 'pickup', player: on, cell: { ...s.ball.pos } });
        ctx.stopped.add(on);
      }
    }
    ctx.frames.push(snapshot(ctx));
    checkDuels(ctx, step);
  }
  return step;
}

// ---------------------------------------------------------------------------
// Duelos
// ---------------------------------------------------------------------------

type Row = 'driblar' | 'proteger' | 'passar' | 'neutro';

function rowOf(action: string): Row {
  if (action === 'driblar') return 'driblar';
  if (action === 'proteger') return 'proteger';
  if (action === 'passe_pe' || action === 'passe_espaco' || action === 'tabela' || action === 'chutar') return 'passar';
  return 'neutro';
}

/** Matriz de duelo: [bônus do ataque, bônus da defesa]. */
export function duelMatrix(carrierAction: string, defenderAction: string): [number, number] {
  const b = MATCH_RULES.duel.matrixBonus;
  const row = rowOf(carrierAction);
  const col = defenderAction === 'bote' ? 'bote' : defenderAction === 'conter' ? 'conter' : 'outra';
  if (row === 'driblar') return col === 'conter' ? [0, b] : [b, 0];
  if (row === 'proteger') return col === 'bote' ? [0, b] : [0, 0];
  if (row === 'passar') return col === 'bote' ? [b, 0] : [0, 0];
  return [0, 0];
}

function duelStat(action: string): AttrKey {
  if (action === 'proteger') return 'fisico';
  if (action === 'passe_pe' || action === 'passe_espaco' || action === 'tabela') return 'passe';
  if (action === 'chutar') return 'chute';
  return 'drible';
}

function duelKind(action: string) {
  if (action === 'driblar') return 'drible' as const;
  if (action === 'proteger') return 'protecao' as const;
  if (action === 'chutar') return 'chute' as const;
  if (action === 'passe_pe' || action === 'passe_espaco' || action === 'tabela') return 'passe' as const;
  return 'conducao' as const;
}

function checkDuels(ctx: Ctx, step: number) {
  const s = ctx.s;
  const c = ctx.carrierStart;
  if (!c || ctx.stolen || s.ball.holder !== c) return;
  if (ctx.fx[c].ignoreZones && step > 0) return;
  if (ctx.rhythmImmune === c) return;
  const cp = s.players[c];
  const cAct = ctx.plans[c].action;
  for (const did of ctx.initOrder) {
    const d = s.players[did];
    if (d.team === cp.team || d.isKeeper) continue;
    if (ctx.dueled.has(`${c}|${did}`)) continue;
    if (hasStatus(d, 'caido', ctx.t)) continue;
    const r = zoneRadius(s, did, ctx.t);
    if (r <= 0 || cheb(cp.pos, d.pos) > r) continue;
    const dAct = ctx.plans[did].action;
    const trigger = cAct === 'driblar' || dAct === 'bote' || dAct === 'conter';
    if (!trigger) continue;
    const res = duel(ctx, c, did, step);
    if (res === 'def') return;
    if (ctx.stolen || s.ball.holder !== c) return;
  }
}

function duel(ctx: Ctx, c: string, did: string, step: number): 'atk' | 'def' {
  const s = ctx.s;
  const cp = s.players[c];
  const d = s.players[did];
  const cAct = ctx.plans[c].action;
  const dAct = ctx.plans[did].action;
  let [atkM, defM] = duelMatrix(cAct, dAct);
  const cfx = ctx.fx[c];
  const dfx = ctx.fx[did];
  if (cfx.panther) {
    atkM = MATCH_RULES.duel.matrixBonus;
    defM = 0;
  }
  // ordem das rolagens preservada: dado do ataque, depois o da defesa
  const stat = duelStat(cAct);
  const A = new Roll().add(ATTR_LABEL[stat], attr(ctx, c, stat)).add('dado', ctx.rng.d10());
  A.add(cfx.panther ? skillName('pantera_vermelha') : `${ACTION_LABEL[cAct]} vence ${ACTION_LABEL[dAct]}`, atkM);
  addPenalties(ctx, c, A);
  if (cAct === 'proteger') A.add('Proteger', MATCH_RULES.duel.protectBonus);
  let sambaUsed = false;
  if (cfx.samba && cfx.samba.left > 0 && cAct === 'driblar') {
    A.add(skillName('samba_livre'), cfx.samba.bonus);
    sambaUsed = true;
  }
  const D = new Roll().add(ATTR_LABEL.defesa, attr(ctx, did, 'defesa')).add('dado', ctx.rng.d10());
  D.add(`${ACTION_LABEL[dAct]} vence ${ACTION_LABEL[cAct]}`, defM);
  addPenalties(ctx, did, D);
  D.add('Leitura certa', ctx.readBonus[did] ?? 0);
  D.add('Comandar do goleiro', dfx.commandBonus);
  if (dAct === 'bote') D.add(skillName('carrinho'), dfx.tackleBonus);
  const atk = A.total;
  const def = D.total;
  const winner = atk > def ? 'atk' : 'def';
  const kind = duelKind(cAct);
  ctx.events.push({ t: 'duel', step, attacker: c, defender: did, kind, atk, def, winner, skill: dAct === 'bote' && dfx.tackleBonus ? 'carrinho' : null, atkAction: cAct, defAction: dAct, atkParts: A.parts, defParts: D.parts });
  ctx.dueled.add(`${c}|${did}`);
  cp.lastDuel = { opponent: did, turn: ctx.t };
  d.lastDuel = { opponent: c, turn: ctx.t };
  if (winner === 'atk') {
    cp.stats.duelsWon++;
    d.stats.duelsLost++;
    if (kind === 'drible') {
      cp.stats.dribblesWon++;
      cp.ego++;
      gainFlow(ctx, c, MATCH_RULES.flow.dribbleWon);
      const rh = hasStatus(cp, 'rhythm_active', ctx.t);
      if (rh) cp.rhythm = Math.min(rh.data?.max ?? 3, cp.rhythm + 1);
    }
    if (sambaUsed && cfx.samba) {
      cfx.samba.left--;
      markSuccess(ctx, c, 'samba_livre');
    }
    if (dAct === 'bote') {
      if (dfx.tackleFailDown) addStatus(d, { kind: 'caido', from: ctx.t + 1, until: ctx.t + 1 });
      else addStatus(d, { kind: 'vendido', from: ctx.t + 1, until: ctx.t + 1 });
    }
    ctx.stopped.add(did);
    // Cobertura
    for (const kid of ctx.s.order) {
      const k = s.players[kid];
      const cov = ctx.fx[kid].cover;
      if (!cov || cov.ally !== did || k.team !== d.team || ctx.dueled.has(`${c}|${kid}`)) continue;
      if (cheb(k.pos, cp.pos) > cov.range) continue;
      const A2 = new Roll().add(ATTR_LABEL[stat], attr(ctx, c, stat)).add('dado', ctx.rng.d10());
      addPenalties(ctx, c, A2);
      const D2 = new Roll().add(ATTR_LABEL.defesa, attr(ctx, kid, 'defesa')).add('dado', ctx.rng.d10()).add(skillName('cobertura'), cov.bonus);
      addPenalties(ctx, kid, D2);
      D2.add('Leitura certa', ctx.readBonus[kid] ?? 0);
      const a2 = A2.total;
      const d2 = D2.total;
      const w2 = a2 > d2 ? 'atk' : 'def';
      ctx.events.push({ t: 'duel', step, attacker: c, defender: kid, kind: 'cobertura', atk: a2, def: d2, winner: w2, skill: 'cobertura', atkAction: cAct, defAction: ctx.plans[kid].action, atkParts: A2.parts, defParts: D2.parts });
      ctx.dueled.add(`${c}|${kid}`);
      if (w2 === 'def') {
        k.stats.duelsWon++;
        k.stats.tackles++;
        cp.stats.duelsLost++;
        markSuccess(ctx, kid, 'cobertura');
        steal(ctx, c, kid, step);
        return 'def';
      }
      break;
    }
    return 'atk';
  }
  d.stats.duelsWon++;
  d.stats.tackles++;
  cp.stats.duelsLost++;
  if (kind === 'drible') cp.stats.dribblesLost++;
  if (dAct === 'bote' && dfx.tackleBonus) markSuccess(ctx, did, 'carrinho');
  steal(ctx, c, did, step);
  return 'def';
}

function steal(ctx: Ctx, from: string, to: string, step: number) {
  setHolder(ctx, to);
  ctx.stolen = true;
  ctx.stopped.add(from);
  ctx.stopped.add(to);
  ctx.events.push({ t: 'steal', step, from, to });
}

// ---------------------------------------------------------------------------
// Passe
// ---------------------------------------------------------------------------

interface PassOpts {
  from: string;
  receiver: string | null;
  dest: Cell;
  kind: 'pe' | 'espaco' | 'tabela';
  receptionBonus: number;
}

/** Retorna o id de quem ficou com a bola (ou null se solta/fora). */
function doPass(ctx: Ctx, o: PassOpts): string | null {
  const s = ctx.s;
  const f = s.setup.field;
  const passer = s.players[o.from];
  const fx = ctx.fx[o.from];
  passer.stats.passesAttempted++;
  const passAttr = attr(ctx, o.from, 'passe');
  const dist = cheb(passer.pos, o.dest);
  const over = dist - Math.floor(passAttr / 2);
  const pen = over > 0 ? Math.ceil(over / MATCH_RULES.pass.penaltyEvery) : 0;
  const P = new Roll().add(ATTR_LABEL.passe, passAttr).add('dado', ctx.rng.d10()).add(`distância (${dist} casas)`, -pen);
  addPenalties(ctx, o.from, P);
  // bônus de recepção: casa do passe no espaço e, o que sobrar, Desmarque de quem recebe
  const space = Math.min(o.receptionBonus, o.kind === 'espaco' && o.receiver ? MATCH_RULES.offBall.spaceReceptionBonus : 0);
  P.add('recebe no espaço', space).add('Desmarque do companheiro', o.receptionBonus - space);
  const recvPlan = o.receiver ? ctx.plans[o.receiver] : null;
  const asked = !!recvPlan && recvPlan.action === 'pedir_bola';
  if (asked) P.add('pediu a bola', MATCH_RULES.offBall.pedirBolaPassBonus);
  const roll = P.total;
  const parts = P.parts;

  // passe torto
  if (roll < MATCH_RULES.pass.astrayThreshold) {
    const off = roll < 4 ? 2 : 1;
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    const [dx, dy] = ctx.rng.pick(dirs);
    const landed = { x: o.dest.x + dx * off, y: o.dest.y + dy * off };
    if (!inBounds(landed, f)) {
      const border = nearestBorder(landed, f);
      const to = giveToOpponentAtBorder(ctx, passer.team, border);
      ctx.events.push({ t: 'pass', from: o.from, to: o.receiver, cell: o.dest, kind: o.kind, roll, result: 'out', landed: border, parts });
      ctx.events.push({ t: 'out', team: otherTeam(passer.team), cell: border, to });
      return to;
    }
    const on = s.order.find((id) => eq(s.players[id].pos, landed));
    ctx.events.push({ t: 'pass', from: o.from, to: o.receiver, cell: o.dest, kind: o.kind, roll, result: 'astray', landed, by: on ?? null, parts });
    if (on) {
      setHolder(ctx, on);
      if (s.players[on].team === passer.team) return on;
      s.players[on].stats.interceptions++;
      return on;
    }
    setHolder(ctx, null, landed);
    ctx.events.push({ t: 'loose', cell: landed });
    return null;
  }

  // interceptação
  const path = line(passer.pos, o.dest).slice(1);
  const trailProtected = s.trails.some((tr) => tr.team === passer.team && tr.until >= ctx.t && tr.cells.some((c) => eq(c, o.dest)));
  const immune = ctx.rhythmImmune === o.from;
  if (!trailProtected && !immune) {
    const openers = s.order
      .map((id) => s.players[id])
      .filter((a) => a.team === passer.team && ctx.plans[a.id]?.action === 'abrir_linha')
      .filter((a) => a.id === o.receiver || path.some((c) => cheb(c, a.pos) <= 1));
    const candidates = s.order
      .map((id) => s.players[id])
      .filter((e) => e.team !== passer.team && !hasStatus(e, 'caido', ctx.t))
      .map((e) => {
        let r = zoneRadius(s, e.id, ctx.t);
        if (e.isKeeper) r = ctx.plans[e.id]?.action === 'gk_adiantar' ? 1 : 0;
        const idx = r > 0 ? path.findIndex((c) => cheb(c, e.pos) <= r) : -1;
        return { e, idx };
      })
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx);
    let skip = fx.curve;
    if (skip > 0 && candidates.length) markSuccess(ctx, o.from, 'passe_curva');
    for (const { e } of candidates) {
      if (skip > 0) {
        skip--;
        continue;
      }
      const eplan = ctx.plans[e.id];
      const I = new Roll().add(ATTR_LABEL.defesa, attr(ctx, e.id, 'defesa')).add('dado', ctx.rng.d10());
      addPenalties(ctx, e.id, I);
      I.add('Leitura certa', ctx.readBonus[e.id] ?? 0);
      I.add('Comandar do goleiro', ctx.fx[e.id].commandBonus);
      if (eplan?.action === 'fechar_linha') {
        I.add('Fechar linha', MATCH_RULES.offBall.fecharLinhaInterceptBonus);
        if (cheb(e.pos, passer.pos) <= 1) I.add('colado em quem passou', MATCH_RULES.duel.matrixBonus);
      }
      if (e.isKeeper) I.add('Adiantar linha', MATCH_RULES.goalkeeper.advanceInterceptBonus);
      if (openers.length) I.add('Abrir linha do atacante', -MATCH_RULES.offBall.abrirLinhaInterceptPenalty);
      const r = I.total;
      if (r >= roll) {
        setHolder(ctx, e.id);
        e.stats.interceptions++;
        ctx.events.push({ t: 'pass', from: o.from, to: o.receiver, cell: o.dest, kind: o.kind, roll, result: 'intercepted', by: e.id, parts, interceptRoll: r, interceptParts: I.parts });
        return e.id;
      }
    }
  }

  // chegada
  if (!o.receiver) {
    setHolder(ctx, null, o.dest);
    ctx.events.push({ t: 'pass', from: o.from, to: null, cell: o.dest, kind: o.kind, roll, result: 'loose', parts });
    ctx.events.push({ t: 'loose', cell: o.dest });
    return null;
  }
  const rcv = s.players[o.receiver];
  setHolder(ctx, o.receiver);
  passer.stats.passesCompleted++;
  ctx.events.push({ t: 'pass', from: o.from, to: o.receiver, cell: o.dest, kind: o.kind, roll, result: 'ok', parts });
  s.lastPass = { passer: o.from, receiver: o.receiver, turn: ctx.t };
  if (asked) {
    passer.chem += MATCH_RULES.offBall.pedirBolaChemistry;
    rcv.chem += MATCH_RULES.offBall.pedirBolaChemistry;
    rcv.stats.askedPassesAnswered++;
  }
  const rh = hasStatus(passer, 'rhythm_active', ctx.t);
  if (rh && rh.data?.pass) passer.rhythm = Math.min(rh.data.max ?? 3, passer.rhythm + 1);
  // desmarque: quem marcava fica com -1 no próximo lance
  if (recvPlan?.action === 'desmarque') {
    const marker =
      s.order.map((id) => s.players[id]).find((e) => e.team !== rcv.team && ctx.plans[e.id]?.action === 'marcar' && ctx.plans[e.id]?.targetPlayer === rcv.id) ??
      s.order
        .map((id) => s.players[id])
        .filter((e) => e.team !== rcv.team && !e.isKeeper)
        .sort((a, b) => cheb(a.pos, rcv.pos) - cheb(b.pos, rcv.pos))[0];
    if (marker && cheb(marker.pos, rcv.pos) <= 3) addStatus(marker, { kind: 'desmarcado', from: ctx.t + 1, until: ctx.t + 1 });
  }
  return o.receiver;
}

function giveToOpponentAtBorder(ctx: Ctx, passerTeam: Team, border: Cell): string | null {
  const s = ctx.s;
  const opp = s.order
    .map((id) => s.players[id])
    .filter((p) => p.team !== passerTeam && !p.isKeeper)
    .sort((a, b) => cheb(a.pos, border) - cheb(b.pos, border))[0];
  if (!opp) {
    setHolder(ctx, null, border);
    return null;
  }
  const occupied = s.order.some((id) => id !== opp.id && eq(s.players[id].pos, border));
  if (!occupied) opp.pos = { ...border };
  setHolder(ctx, opp.id);
  return opp.id;
}

function afterReception(ctx: Ctx, rid: string) {
  const plan = ctx.plans[rid];
  const fx = ctx.fx[rid];
  const p = ctx.s.players[rid];
  if (plan.action !== 'finalizar_primeira') return;
  const puzzleHit = fx.puzzle > 0 && eq(p.pos, plan.dest);
  let bonus = 0;
  if (fx.directShot) {
    bonus += fx.directShot;
    markSuccess(ctx, rid, 'chute_direto');
  }
  if (puzzleHit) {
    bonus += fx.puzzle;
    markSuccess(ctx, rid, 'peca_que_encaixa');
  }
  shoot(ctx, rid, plan.shotZone ?? 1, { oneTouch: true, bonus, noKeeperZone: puzzleHit });
}

function resolveBallAction(ctx: Ctx) {
  const s = ctx.s;
  const c = ctx.carrierStart;
  if (!c || ctx.stolen || s.ball.holder !== c) return;
  const plan = ctx.plans[c];
  const act = plan.action;
  if (act !== 'proteger') ctx.ballActionTaken = true;
  if (act === 'chutar') {
    let bonus = 0;
    const fx = ctx.fx[c];
    const moved = ctx.moved[c] ?? 0;
    if (fx.speedShot && moved >= fx.speedShot.minCells) {
      bonus += Math.min(moved, fx.speedShot.maxBonus);
      markSuccess(ctx, c, 'chute_velocidade');
    }
    shoot(ctx, c, plan.shotZone ?? 1, { oneTouch: false, bonus, noKeeperZone: false });
    return;
  }
  if (!isPassAction(act)) return;
  const cp = s.players[c];
  if (act === 'passe_espaco' && plan.targetCell) {
    const dest = plan.targetCell;
    // aliado na casa ou ao lado recebe com +2 (prioridade: na casa, depois desmarque, depois mais perto)
    const allies = s.order
      .map((id) => s.players[id])
      .filter((a) => a.team === cp.team && a.id !== c && cheb(a.pos, dest) <= 1)
      .sort((a, b) => {
        const da = cheb(a.pos, dest);
        const db = cheb(b.pos, dest);
        if (da !== db) return da - db;
        const ma = ctx.plans[a.id]?.action === 'desmarque' ? 0 : 1;
        const mb = ctx.plans[b.id]?.action === 'desmarque' ? 0 : 1;
        return ma - mb;
      });
    const rcv = allies[0]?.id ?? null;
    let bonus = rcv ? MATCH_RULES.offBall.spaceReceptionBonus : 0;
    if (rcv && ctx.plans[rcv]?.action === 'desmarque') bonus += MATCH_RULES.offBall.desmarqueReceptionBonus;
    const got = doPass(ctx, { from: c, receiver: rcv, dest: rcv ? s.players[rcv].pos : dest, kind: 'espaco', receptionBonus: bonus });
    if (got && got === rcv) afterReception(ctx, got);
    else if (!got) checkPuzzleLoose(ctx, cp.team);
    return;
  }
  const rid = plan.targetPlayer;
  if (!rid || !s.players[rid] || s.players[rid].team !== cp.team) return;
  const rplan = ctx.plans[rid];
  const bonus = rplan?.action === 'desmarque' ? MATCH_RULES.offBall.desmarqueReceptionBonus : 0;
  const isTabela = act === 'tabela' && rplan?.action === 'tabela' && rplan.targetPlayer === c;
  const got = doPass(ctx, { from: c, receiver: rid, dest: s.players[rid].pos, kind: isTabela ? 'tabela' : 'pe', receptionBonus: bonus });
  if (got !== rid) {
    if (!got) checkPuzzleLoose(ctx, cp.team);
    return;
  }
  if (isTabela) {
    const back = doPass(ctx, { from: rid, receiver: c, dest: cp.pos, kind: 'tabela', receptionBonus: 0 });
    if (back === c) {
      cp.chem++;
      s.players[rid].chem++;
      cp.stats.tabelas++;
      s.players[rid].stats.tabelas++;
    }
    return;
  }
  afterReception(ctx, rid);
}

/** Peça que Encaixa também dispara com bola solta (desvio) na casa marcada. */
function checkPuzzleLoose(ctx: Ctx, team: Team) {
  const s = ctx.s;
  if (s.ball.holder) return;
  for (const id of s.order) {
    const p = s.players[id];
    if (p.team !== team || !ctx.fx[id].puzzle) continue;
    if (eq(p.pos, s.ball.pos) || (eq(ctx.plans[id].dest, s.ball.pos) && cheb(p.pos, s.ball.pos) <= 1)) {
      setHolder(ctx, id);
      afterReception(ctx, id);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Chute
// ---------------------------------------------------------------------------

export function zonesAdjacent(a: GoalZone, b: GoalZone): boolean {
  const ca = a % 3;
  const ra = Math.floor(a / 3);
  const cb = b % 3;
  const rb = Math.floor(b / 3);
  return Math.abs(ca - cb) + Math.abs(ra - rb) === 1;
}

interface ShotOpts {
  oneTouch: boolean;
  bonus: number;
  noKeeperZone: boolean;
}

function shoot(ctx: Ctx, sid: string, zone: GoalZone, o: ShotOpts) {
  const s = ctx.s;
  const f = s.setup.field;
  const sp = s.players[sid];
  ctx.ballActionTaken = true;
  const gx = attackingGoalX(sp.team, f);
  const gCells = goalCells(gx, f);
  const center = goalCenter(gx, f);
  const dist = distToCells(sp.pos, gCells);
  const R = MATCH_RULES.shot;
  const distOnly = dist > R.freeDistance ? Math.ceil((dist - R.freeDistance) / R.penaltyEvery) : 0;
  const anglePen = rowsOutsideGoal(sp.pos, f) * R.anglePenaltyPerRow;
  const lineCells = line(sp.pos, center).slice(1);
  const enemies = enemiesOf(ctx, sp.team);
  const onLine = enemies.filter((e) => lineCells.some((c) => eq(c, e.pos))).length;
  const S = new Roll().add(ATTR_LABEL.chute, attr(ctx, sid, 'chute')).add('dado', ctx.rng.d10());
  S.add(`distância (${dist} casas)`, -distOnly).add('ângulo fechado', -anglePen).add(onLine > 1 ? `${onLine} marcadores na frente` : 'marcador na frente', -onLine * R.defenderOnLinePenalty);
  S.add('habilidade', o.bonus);
  addPenalties(ctx, sid, S);
  const roll = S.total;
  const parts = S.parts;
  sp.stats.shots++;

  // passe que vira finalização
  if (s.lastPass && s.lastPass.receiver === sid && s.lastPass.turn >= ctx.t - 1) gainFlow(ctx, s.lastPass.passer, MATCH_RULES.flow.passToShot);

  // Corpo Elástico
  const blockers = enemies
    .filter((e) => ctx.fx[e.id].shotBlock && distToCells(e.pos, lineCells) <= ctx.fx[e.id].shotBlock!.range)
    .sort((a, b) => distToCells(a.pos, lineCells) - distToCells(b.pos, lineCells));
  for (const b of blockers) {
    const B = new Roll().add(ATTR_LABEL.fisico, attr(ctx, b.id, 'fisico')).add('dado', ctx.rng.d10());
    addPenalties(ctx, b.id, B);
    const br = B.total;
    if (br >= roll) {
      ctx.events.push({ t: 'shot', shooter: sid, zone, keeper: null, keeperZone: null, roll, keeperRoll: br, goal: false, blockedBy: b.id, oneTouch: o.oneTouch, distance: dist, parts, keeperParts: B.parts });
      ctx.events.push({ t: 'block', blocker: b.id, shooter: sid });
      markSuccess(ctx, b.id, 'corpo_elastico');
      setHolder(ctx, b.id);
      return;
    }
    break;
  }

  const k = keeperOf(ctx, otherTeam(sp.team));
  let kRoll = -99;
  let kZone: GoalZone | null = null;
  let keeperParts: RollPart[] | undefined;
  if (k) {
    const kplan = ctx.plans[k.id];
    kZone = (kplan?.keeperZone ?? 1) as GoalZone;
    const ka = effectiveAttrs(s, k.id, ctx.t);
    const K = new Roll().add(`média de ${ATTR_LABEL.fisico} e ${ATTR_LABEL.visao}`, Math.floor((ka.fisico + ka.visao) / 2)).add('dado', ctx.rng.d10());
    addPenalties(ctx, k.id, K);
    if (!o.noKeeperZone) {
      if (kZone === zone) K.add('acertou o canto', R.keeperExactZone);
      else if (zonesAdjacent(kZone, zone)) K.add('canto vizinho', R.keeperAdjacentZone);
    }
    if (kplan?.action === 'gk_adiantar') K.add('Adiantar linha', -MATCH_RULES.goalkeeper.advanceSavePenalty);
    kRoll = K.total;
    keeperParts = K.parts;
  }
  const goal = roll > kRoll;
  ctx.events.push({ t: 'shot', shooter: sid, zone, keeper: k?.id ?? null, keeperZone: o.noKeeperZone ? null : kZone, roll, keeperRoll: kRoll, goal, oneTouch: o.oneTouch, distance: dist, parts, keeperParts });
  if (goal) {
    s.score[sp.team]++;
    sp.stats.goals++;
    if (o.oneTouch) sp.stats.goalsOneTouch++;
    sp.ego++;
    gainFlow(ctx, sid, MATCH_RULES.flow.goal);
    let assist: string | null = null;
    if (s.lastPass && s.lastPass.receiver === sid && s.lastPass.turn >= ctx.t - 1 && s.lastPass.passer !== sid) {
      assist = s.lastPass.passer;
      s.players[assist].stats.assists++;
      s.players[assist].chem++;
    }
    ctx.events.push({ t: 'goal', team: sp.team, scorer: sid, assist, oneTouch: o.oneTouch });
    ctx.goal = sp.team;
    setHolder(ctx, null, gCells[1] ?? center);
  } else if (k) {
    k.stats.saves++;
    gainFlow(ctx, k.id, MATCH_RULES.flow.goalkeeperSave);
    ctx.events.push({ t: 'save', keeper: k.id, shooter: sid });
    setHolder(ctx, k.id);
  }
}

// ---------------------------------------------------------------------------
// Bola solta na área (goleiro)
// ---------------------------------------------------------------------------

function keeperLooseBall(ctx: Ctx) {
  const s = ctx.s;
  if (s.ball.holder) return;
  const on = s.order.find((id) => eq(s.players[id].pos, s.ball.pos));
  if (on) {
    setHolder(ctx, on);
    ctx.events.push({ t: 'pickup', player: on, cell: { ...s.ball.pos } });
    return;
  }
  for (const team of ['A', 'B'] as Team[]) {
    if (!isInArea(s.ball.pos, team, s.setup.field)) continue;
    const k = keeperOf(ctx, team);
    if (!k || ctx.plans[k.id]?.action !== 'gk_sair' || cheb(k.pos, s.ball.pos) > 2) continue;
    const ka = effectiveAttrs(s, k.id, ctx.t);
    const kr = Math.floor((ka.fisico + ka.visao) / 2) + ctx.rng.d10() + MATCH_RULES.goalkeeper.rushLooseBonus;
    const rival = enemiesOf(ctx, team)
      .filter((e) => cheb(e.pos, s.ball.pos) <= 1)
      .sort((a, b) => ctx.init[b.id] - ctx.init[a.id])[0];
    const rr = rival ? attr(ctx, rival.id, 'velocidade') + ctx.rng.d10() : -99;
    const winner = kr >= rr ? k : rival!;
    if (!s.order.some((id) => id !== winner.id && eq(s.players[id].pos, s.ball.pos))) winner.pos = { ...s.ball.pos };
    setHolder(ctx, winner.id);
    ctx.events.push({ t: 'pickup', player: winner.id, cell: { ...s.ball.pos } });
    return;
  }
}

// ---------------------------------------------------------------------------
// Lance completo
// ---------------------------------------------------------------------------

function revealed(state: MatchState, plans: PlanMap): RevealedPlan[] {
  const holder = state.ball.holder;
  return state.order.map((id) => {
    const p = state.players[id];
    const pl = plans[id];
    let context: RevealedPlan['context'];
    if (p.isKeeper && holder !== id) context = 'keeper';
    else if (!holder) context = 'loose';
    else if (holder === id) {
      const contact = state.order.some((o) => {
        const e = state.players[o];
        return e.team !== p.team && !e.isKeeper && cheb(e.pos, p.pos) <= zoneRadius(state, o);
      });
      context = contact ? 'carrier_contact' : 'carrier';
    } else context = state.players[holder].team === p.team ? 'attack' : 'defense';
    return {
      playerId: id,
      action: pl.action,
      from: { ...p.pos },
      dest: { ...pl.dest },
      shotZone: pl.shotZone ?? null,
      keeperZone: pl.keeperZone ?? null,
      readGuess: pl.readGuess ?? null,
      targetPlayer: pl.targetPlayer ?? null,
      skill: pl.skill ?? null,
      usedFlow: !!pl.useFlow,
      context,
      hadBall: holder === id,
    };
  });
}

/**
 * Resolve um lance. Função pura: não altera `prev`.
 * Mesma seed (dentro do estado) + mesmos planos = mesmo resultado.
 */
export function resolveTurn(prev: MatchState, inputPlans: PlanMap): TurnResult {
  if (prev.finished) throw new Error('Partida encerrada.');
  const s = clone(prev);
  const plans = normalizePlans(s, inputPlans);
  const rng = new Rng(s.rng);
  const ctx: Ctx = {
    s,
    rng,
    t: s.turn,
    plans,
    events: [],
    frames: [],
    paths: {},
    moved: {},
    init: {},
    initOrder: [],
    fx: Object.fromEntries(s.order.map((id) => [id, emptyFx()])),
    readBonus: {},
    dueled: new Set(),
    stopped: new Set(),
    carrierStart: s.ball.holder,
    attackingTeam: s.ball.holder ? s.players[s.ball.holder].team : null,
    stolen: false,
    goal: null,
    successes: [],
    rhythmImmune: null,
    ballActionTaken: false,
  };
  const history = revealed(s, plans);

  // Ritmo cheio: próxima ação de bola imune
  if (ctx.carrierStart) {
    const cp = s.players[ctx.carrierStart];
    const max = hasStatus(cp, 'rhythm_active', ctx.t)?.data?.max ?? 3;
    if (cp.rhythm >= max && plans[ctx.carrierStart].action !== 'proteger') ctx.rhythmImmune = ctx.carrierStart;
  }

  activateAll(ctx);
  rollInitiative(ctx);
  resolveReads(ctx);

  ctx.frames.push(snapshot(ctx));
  checkDuels(ctx, 0);
  const step = runSteps(ctx, buildMovers(ctx, false), 0);
  runSteps(ctx, buildMovers(ctx, true), step);

  // trilhas da Faixa de Aceleração
  for (const id of s.order) {
    const tr = ctx.fx[id].trail;
    if (!tr) continue;
    const cells = ctx.paths[id] ?? [];
    if (cells.length >= tr.minCells) {
      s.trails.push({ team: s.players[id].team, owner: id, cells: cells.map((c) => ({ ...c })), until: ctx.t + tr.turns - 1 });
      markSuccess(ctx, id, 'faixa_aceleracao');
    }
  }

  resolveBallAction(ctx);
  if (!ctx.goal) keeperLooseBall(ctx);
  if (ctx.rhythmImmune && ctx.ballActionTaken) {
    s.players[ctx.rhythmImmune].rhythm = 0;
    markSuccess(ctx, ctx.rhythmImmune, 'ritmo_ginga', 'ritmo consumido');
  }
  ctx.frames.push(snapshot(ctx));

  // maestria: contagem de usos bem-sucedidos
  for (const { player, skillId } of ctx.successes) {
    const st = s.players[player].stats;
    st.skillUses[skillId] = (st.skillUses[skillId] ?? 0) + 1;
  }

  // fim do lance
  for (const id of s.order) {
    const p = s.players[id];
    p.stamina = Math.min(MATCH_RULES.stamina.max, p.stamina + MATCH_RULES.stamina.regenPerTurn);
    p.statuses = p.statuses.filter((st) => st.until > ctx.t);
    p.stats.totalTurns++;
    if (!plans[id].auto) p.stats.activeTurns++;
  }
  s.trails = s.trails.filter((tr) => tr.until > ctx.t);
  s.history.push({ turn: ctx.t, plans: history, events: ctx.events });
  s.rng = rng.state();

  const log = narrate(s, ctx.events, plans);

  if (ctx.goal) resetForKickoff(s, otherTeam(ctx.goal));

  // avanço de lance e tempo
  s.turn++;
  s.turnInHalf++;
  const fT = s.setup.firstTo;
  if (fT && (s.score.A >= fT || s.score.B >= fT)) finish(s, ctx.events);
  else if (s.turnInHalf > s.setup.turnsPerHalf) {
    if (s.half >= s.setup.halves) finish(s, ctx.events);
    else {
      s.half++;
      s.turnInHalf = 1;
      ctx.events.push({ t: 'halftime' });
      resetForKickoff(s, s.half % 2 === 0 ? 'B' : 'A');
    }
  }

  return { state: s, events: ctx.events, frames: ctx.frames, log, plans, paths: ctx.paths, goal: ctx.goal };
}

function finish(s: MatchState, events: MatchEvent[]) {
  s.finished = true;
  s.winner = s.score.A > s.score.B ? 'A' : s.score.B > s.score.A ? 'B' : 'draw';
  events.push({ t: 'end', winner: s.winner });
}

/** Encerra antes do tempo (admin ou W.O.). */
export function forceFinish(state: MatchState, winner?: Team | 'draw'): MatchState {
  const s = clone(state);
  s.finished = true;
  s.winner = winner ?? (s.score.A > s.score.B ? 'A' : s.score.B > s.score.A ? 'B' : 'draw');
  return s;
}
