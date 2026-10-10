import {
  MATCH_RULES,
  findSkill,
  getLineage,
  type ActionKind,
  type GoalZone,
  type ReadGuess,
  type SkillDef,
} from '@ego/content';
import { cheb, eq, isStraight, line, stepPath, type Cell } from '../grid';
import {
  baseMoveRange,
  devourSource,
  effectiveAttrs,
  legalActions,
  planMoveRange,
  reachableCells,
  skillFor,
  skillOptions,
} from '../mechanics';
import { passSpaceCandidates, validatePlan } from '../plan';
import type { PublicArrow } from '../revelation';
import type { Rng } from '../rng';
import { slotOf } from '../setup';
import { otherTeam, type Plan } from '../types';
import { evalCondition, turnsLeft, type CondCtx } from './conditions';
import type { Role, TeamDecision } from './coordinator';
import {
  allies,
  attr,
  carryEnd,
  contactKeep,
  danger,
  distanceToGoal,
  distanceToOwnGoal,
  dribbleEstimate,
  enemies,
  inOwnHalf,
  lastLineX,
  openness,
  passEstimate,
  pressureRisk,
  shotEstimate,
  zoneOwners,
  type World,
} from './evaluate';
import { GUESS_KEYS, ownFrequency, predictCarrier } from './model';
import { pBeat, softmaxPick } from './prob';
import type { DifficultyProfile, PersonalityWeights } from './profile';

export interface ScoredOption {
  plan: Plan;
  score: number;
  label: string;
}

export interface DecideInput {
  w: World;
  id: string;
  profile: DifficultyProfile;
  personality: PersonalityWeights;
  team: TeamDecision;
  rng: Rng;
  /** AFK: não gasta o Flow do jogador. */
  noFlow?: boolean;
  /** Janela de reação: o que pode mudar. */
  restrict?: { base: Plan; allowDest: boolean; allowAction: boolean; ballActionOnly: boolean };
  revelation?: PublicArrow[];
}

interface Base {
  plan: Plan;
  score: number;
  label: string;
  /** Casas percorridas (para condições de habilidade). */
  moved: number;
  /** Fator usado para reavaliar com bônus de habilidade. */
  kind: 'carry' | 'dribble' | 'protect' | 'pass' | 'space' | 'shot' | 'tabela' | 'off' | 'def' | 'loose';
  meta?: Record<string, number>;
}

const GOAL_VALUE = 30;

function V(w: World, c: Cell): number {
  return 2 + 10 * danger(w.state, c, w.team);
}
function L(w: World, c: Cell): number {
  return -(4 + 12 * danger(w.state, c, otherTeam(w.team)));
}

function staminaWeight(w: World, id: string, pw: PersonalityWeights): number {
  const p = w.state.players[id];
  const late = turnsLeft(w) <= 4 ? 0.7 : 1.1;
  return 0.07 * pw.stamina * (p.stamina < 50 ? 1.8 : 1) * late;
}

/** Corta destinos antes de pontuar: melhores N pela pontuação rápida + ficar. */
function pruneDests(cells: Cell[], score: (c: Cell) => number, cap: number, keep: Cell): Cell[] {
  const scored = cells.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s);
  const out = scored.slice(0, cap).map((x) => x.c);
  if (!out.some((c) => eq(c, keep))) out.push(keep);
  return out;
}

function occupiedByOther(w: World, id: string, c: Cell): boolean {
  return w.state.order.some((o) => o !== id && eq(w.pos[o], c));
}

// ---------------------------------------------------------------------------
// Portador
// ---------------------------------------------------------------------------

function pickZone(w: World, id: string, from: Cell, bonus: number, x: DecideInput): { zone: GoalZone; p: number } {
  const zs = ([0, 1, 2, 3, 4, 5] as GoalZone[]).map((z) => ({ zone: z, p: shotEstimate(w, id, from, z, bonus) }));
  // estratégia mista: amostra entre as boas zonas e evita repetir a última
  const last = [...w.state.history].reverse().flatMap((h) => h.plans).find((p) => p.playerId === id && p.action === 'chutar')?.shotZone;
  const scores = zs.map((z) => z.p * 10 - (last === z.zone ? x.profile.mixing * 1.5 : 0));
  const idx = softmaxPick(zs, scores, 0.6 + (1 - x.profile.mixing) * 0.4, x.rng.next());
  return zs[Math.max(0, idx)];
}

function carrierOptions(x: DecideInput): Base[] {
  const { w, id } = x;
  const s = w.state;
  const me = s.players[id];
  const pos = w.pos[id];
  const pw = x.personality;
  const out: Base[] = [];
  const plan = x.team.plan;
  const riskW = pw.risk * (plan === 'segurar' ? 1.6 : plan === 'construcao' ? 1.2 : plan === 'contra_ataque' ? 0.85 : 1);
  const legal = legalActions(s, id);
  const reach = reachableCells(s, id);
  const sw = staminaWeight(w, id, pw);
  const canSprint = me.stamina >= MATCH_RULES.stamina.sprintCost + 10;
  const sprintReach = canSprint ? reachableCells(s, id, { sprint: true }) : [];
  const baseR = baseMoveRange(s, id);
  const wing = plan === 'ponta' ? 1 : 0;
  const quick = (c: Cell) =>
    danger(s, c, w.team) * 10 + Math.min(openness(w, c), 3) * 0.7 - zoneOwners(w, c).length * 0.8 + (wing && (c.y <= 1 || c.y >= s.setup.field.height - 2) ? 1 : 0);
  const dests = pruneDests(reach.filter((c) => !occupiedByOther(w, id, c)), quick, x.profile.destCap, pos);
  const far = pruneDests(
    sprintReach.filter((c) => cheb(c, pos) > baseR && !occupiedByOther(w, id, c)),
    quick,
    Math.ceil(x.profile.destCap / 3),
    pos,
  ).filter((c) => !eq(c, pos));

  const add = (b: Base) => out.push(b);
  const keepCarry = contactKeep(w, id, pos, 'conducao');
  const keepPass = contactKeep(w, id, pos, 'passar');
  const lossMid = (d: Cell) => ({ x: Math.round((pos.x + d.x) / 2), y: Math.round((pos.y + d.y) / 2) });
  const keeperCarrier = me.isKeeper;

  for (const [list, sprint] of [
    [dests, false],
    [far, true],
  ] as [Cell[], boolean][]) {
    for (const d of list) {
      const sprintCost = sprint ? MATCH_RULES.stamina.sprintCost * sw : 0;
      if (legal.includes('conduzir') && !eq(d, pos)) {
        const end = carryEnd(w, pos, d);
        const risk = pressureRisk(w, id, end);
        const pKeep = keepCarry * (1 - risk * 0.6);
        const sc = pKeep * V(w, end) + (1 - pKeep) * L(w, end) * riskW - sprintCost;
        add({ plan: { playerId: id, dest: d, action: 'conduzir', sprint }, score: sc, label: 'Conduzir', moved: cheb(pos, end), kind: 'carry' });
      }
      if (legal.includes('driblar') && !eq(d, pos)) {
        const est = dribbleEstimate(w, id, pos, d);
        const pKeep = est.p * (1 - 0.5 * pressureRisk(w, id, est.end));
        const flowBonus = est.duels.length * est.p * 0.4;
        const gain = V(w, est.end) * (est.duels.length ? pw.dribble : 1);
        const sc = pKeep * gain + (1 - pKeep) * L(w, lossMid(d)) * riskW + flowBonus - sprintCost;
        add({ plan: { playerId: id, dest: d, action: 'driblar', sprint }, score: sc, label: `Driblar (${est.duels.length} duelo(s))`, moved: cheb(pos, est.end), kind: 'dribble', meta: { duels: est.duels.length, p: est.p } });
      }
    }
  }

  if (legal.includes('proteger')) {
    const risk = pressureRisk(w, id, pos, true);
    const sc = ((1 - risk) * V(w, pos) * 0.95 + risk * L(w, pos) * riskW) * pw.protect + (plan === 'segurar' ? 1.5 : 0);
    add({ plan: { playerId: id, dest: pos, action: 'proteger' }, score: sc, label: 'Proteger', moved: 0, kind: 'protect' });
  }

  // chute: do lugar ou depois de conduzir para frente
  if (legal.includes('chutar')) {
    const origins = [pos, ...dests.filter((d) => distanceToGoal(s, d, w.team) < distanceToGoal(s, pos, w.team)).slice(0, 3)];
    for (const o of origins) {
      const end = eq(o, pos) ? pos : carryEnd(w, pos, o);
      if (inOwnHalf(s, end, w.team)) continue; // nunca chuta do próprio campo
      const dist = distanceToGoal(s, end, w.team);
      if (dist > 8) continue;
      const z = pickZone(w, id, end, 0, x);
      // perder no contato antes do chute é perder a bola aqui; chute defendido é posse do goleiro lá
      const sc = keepPass * (z.p * GOAL_VALUE * pw.shoot + (1 - z.p) * -4) + (1 - keepPass) * L(w, pos) * riskW - (dist > 6 ? 2 : 0);
      z.p *= keepPass;
      add({ plan: { playerId: id, dest: o, action: 'chutar', shotZone: z.zone }, score: sc, label: `Chutar (${Math.round(z.p * 100)}%)`, moved: cheb(pos, end), kind: 'shot', meta: { p: z.p } });
    }
  }

  // passes
  if (legal.includes('passe_pe')) {
    for (const a of allies(w, true)) {
      if (a === id) continue;
      const ap = s.players[a];
      if (ap.isKeeper && plan !== 'segurar' && !keeperCarrier) continue;
      // companheiro bot reage ao plano do portador: avalia onde ele está agora
      const recv = w.pos[a];
      const est = passEstimate(w, id, pos, recv, 0);
      est.p *= keepPass;
      const starBonus = plan === 'craque' && a === x.team.star ? 2 : 0;
      const sc = (est.p * (V(w, recv) + Math.min(openness(w, recv), 3) * 0.5) + (1 - est.p) * L(w, est.interceptors[0] ? w.pos[est.interceptors[0]] : recv) * riskW) * pw.pass + starBonus;
      add({ plan: { playerId: id, dest: pos, action: 'passe_pe', targetPlayer: a }, score: sc, label: `Passe para ${slotOf(s, a).name} (${Math.round(est.p * 100)}%)`, moved: 0, kind: 'pass', meta: { p: est.p, interceptors: est.interceptors.length } });
    }
  }
  if (legal.includes('passe_espaco')) {
    const cands = passSpaceCandidates(s, id, 8)
      .map((c) => ({ c, v: danger(s, c, w.team) + Math.min(openness(w, c), 3) * 0.1 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 4);
    for (const { c } of cands) {
      // quem chega na casa: aliado bot com diretiva ou aliado perto
      const runner = allies(w).find((a) => a !== id && cheb(x.team.combo?.directives[a]?.dest ?? w.pos[a], c) <= 1);
      const reach = allies(w).find((a) => a !== id && cheb(w.pos[a], c) <= baseMoveRange(s, a) + 1);
      const pArrive = runner ? 0.9 : reach ? 0.5 : 0.1;
      const est = passEstimate(w, id, pos, c, runner ? MATCH_RULES.offBall.spaceReceptionBonus : 0);
      const pOk = est.p * pArrive * keepPass;
      const sc = (pOk * V(w, c) + (1 - pOk) * L(w, c) * riskW * 0.8) * pw.pass;
      add({ plan: { playerId: id, dest: pos, action: 'passe_espaco', targetCell: c }, score: sc, label: `Passe no espaço (${Math.round(pOk * 100)}%)`, moved: 0, kind: 'space', meta: { p: pOk, interceptors: est.interceptors.length } });
    }
  }
  // tabela só com parceiro combinado (combo)
  const dir = x.team.combo?.directives[id];
  if (dir && dir.action === 'tabela' && dir.targetPlayer) {
    const partner = dir.targetPlayer;
    const e1 = passEstimate(w, id, pos, w.pos[partner]);
    const e2 = passEstimate(w, partner, w.pos[partner], dir.dest);
    const p = e1.p * e2.p;
    const sc = (p * (V(w, dir.dest) + 1.5) + (1 - p) * L(w, pos) * riskW) * pw.pass;
    add({ plan: { playerId: id, dest: dir.dest, action: 'tabela', targetPlayer: partner }, score: sc, label: `Tabela (${Math.round(p * 100)}%)`, moved: cheb(pos, dir.dest), kind: 'tabela' });
  }
  // anti-padrão: penaliza a família de ação que o bot mais repete
  for (const o of out) {
    const g = o.kind === 'dribble' || o.kind === 'carry' ? 'drible' : o.kind === 'protect' ? 'proteger' : o.kind === 'shot' ? 'chute' : 'passe';
    const f = ownFrequency(w.model, id, g);
    if (f > 0.7) o.score -= (f - 0.7) * 4 * x.profile.mixing;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sem bola: ataque
// ---------------------------------------------------------------------------

function attackOptions(x: DecideInput, role: Role): Base[] {
  const { w, id } = x;
  const s = w.state;
  const pos = w.pos[id];
  const holder = s.ball.holder!;
  const hp = w.pos[holder];
  const dirX = w.team === 'A' ? 1 : -1;
  const ll = lastLineX(w);
  const out: Base[] = [];
  const reach = reachableCells(s, id).filter((c) => !occupiedByOther(w, id, c));
  const pw = x.personality;
  // corte barato (sem estimar passe) e pontuação completa só para os candidatos que sobram
  const cheapScore = (c: Cell) => {
    let v = danger(s, c, w.team) * 6 + Math.min(openness(w, c), 3) * 0.8;
    if (role === 'apoio') v -= Math.abs(cheb(hp, c) - 2) * 1.2;
    if (role === 'profundidade') v += ((c.x - ll) * dirX > 0 ? 2.5 : 0) + danger(s, c, w.team) * 3;
    if (role === 'isca') v += cheb(hp, c) * 0.4 + (c.y <= 1 || c.y >= s.setup.field.height - 2 ? 1 : 0);
    if (role === 'cobertura') v += distanceToOwnGoal(s, c, w.team) < distanceToOwnGoal(s, hp, w.team) ? 2 : 0;
    return v;
  };
  const roleScore = (c: Cell) => {
    let v = danger(s, c, w.team) * 6 + Math.min(openness(w, c), 3) * 0.8;
    const pe = passEstimate(w, holder, hp, c);
    v += pe.p * 2.5;
    if (role === 'apoio') v -= Math.abs(cheb(hp, c) - 2) * 1.2;
    if (role === 'profundidade') v += ((c.x - ll) * dirX > 0 ? 2.5 : 0) + danger(s, c, w.team) * 3;
    if (role === 'isca') v += cheb(hp, c) * 0.4 + (c.y <= 1 || c.y >= s.setup.field.height - 2 ? 1 : 0);
    if (role === 'cobertura') v += (distanceToOwnGoal(s, c, w.team) < distanceToOwnGoal(s, hp, w.team) ? 2 : 0) - danger(s, c, w.team) * 3;
    if (x.team.plan === 'contra_ataque') v += (c.x - pos.x) * dirX * 0.4;
    return v;
  };
  // chance de a bola vir para esta casa: com portador bot, o plano dele é conhecido pelo time
  const cp = x.team.carrierPlan;
  const from = cp ? cp.dest : hp;
  const recvInfo = (d: Cell): { chance: number; p: number } => {
    if (!cp) return { chance: 0.45, p: passEstimate(w, holder, hp, d).p };
    if ((cp.action === 'passe_pe' || cp.action === 'tabela') && cp.targetPlayer === id) return { chance: 1, p: passEstimate(w, holder, from, d).p };
    if (cp.action === 'passe_espaco' && cp.targetCell && cheb(cp.targetCell, d) <= 1)
      return { chance: 1, p: passEstimate(w, holder, from, cp.targetCell, MATCH_RULES.offBall.spaceReceptionBonus).p };
    return { chance: 0.05, p: passEstimate(w, holder, from, d).p };
  };
  const extraDests: Cell[] = [];
  if (cp?.action === 'passe_espaco' && cp.targetCell) extraDests.push(...reach.filter((c) => cheb(c, cp.targetCell!) <= 1));
  const dests = [...pruneDests(pruneDests(reach, cheapScore, x.profile.destCap * 2, pos), roleScore, x.profile.destCap, pos), ...extraDests.filter((c) => !occupiedByOther(w, id, c))];
  const legal = legalActions(s, id);
  const enemyAdj = enemies(w).filter((e) => cheb(w.pos[e], pos) <= 1);
  for (const d of dests) {
    const ri = recvInfo(d);
    const pe = { p: ri.p * ri.chance };
    const recvValue = pe.p * (1 + danger(s, d, w.team) * 5);
    const base = roleScore(d) * 0.5 + recvValue;
    out.push({ plan: { playerId: id, dest: d, action: 'mover' }, score: base, label: 'Mover', moved: cheb(pos, d), kind: 'off' });
    if (legal.includes('desmarque')) {
      const markerNear = enemies(w).some((e) => cheb(w.pos[e], pos) <= 2) ? 0.8 : 0.1;
      out.push({ plan: { playerId: id, dest: d, action: 'desmarque' }, score: base + recvValue * 0.25 + markerNear, label: 'Desmarque', moved: cheb(pos, d), kind: 'off' });
    }
    if (legal.includes('pedir_bola') && pe.p > 0.5 && openness(w, d) >= 2) {
      out.push({ plan: { playerId: id, dest: d, action: 'pedir_bola' }, score: base + 0.6 * pw.pass, label: 'Pedir a bola', moved: cheb(pos, d), kind: 'off' });
    }
    if (legal.includes('abrir_linha')) {
      const nearLane = allies(w).some((a) => a !== id && a !== holder && line(hp, w.pos[a]).some((c) => cheb(c, d) <= 1));
      if (nearLane) out.push({ plan: { playerId: id, dest: d, action: 'abrir_linha' }, score: base + 0.7, label: 'Abrir linha', moved: cheb(pos, d), kind: 'off' });
    }
    if (legal.includes('finalizar_primeira') && distanceToGoal(s, d, w.team) <= 5 && !inOwnHalf(s, d, w.team)) {
      const z = pickZone(w, id, d, 0, x);
      const pRecv = pe.p;
      out.push({
        plan: { playerId: id, dest: d, action: 'finalizar_primeira', shotZone: z.zone },
        score: roleScore(d) * 0.5 + pRecv * z.p * GOAL_VALUE * 0.6 * pw.shoot,
        label: `Chute de primeira (${Math.round(z.p * 100)}%)`,
        moved: cheb(pos, d),
        kind: 'off',
        meta: { p: z.p, pRecv },
      });
    }
  }
  if (legal.includes('corta_luz')) {
    for (const e of enemyAdj) {
      if (cheb(w.pos[e], hp) > 2) continue;
      const pr = predictCarrier(w.model, holder, true);
      out.push({ plan: { playerId: id, dest: pos, action: 'corta_luz', targetPlayer: e }, score: 1.5 + pr.drible * 2 + roleScore(pos) * 0.3, label: 'Corta-luz', moved: 0, kind: 'off' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sem bola: defesa
// ---------------------------------------------------------------------------

function readGuess(x: DecideInput, holder: string, inContact: boolean): { guess: ReadGuess; p: number } {
  const pr = predictCarrier(x.w.model, holder, inContact);
  const keys = GUESS_KEYS;
  const scores = keys.map((k) => pr[k] * 10);
  const idx = softmaxPick(keys, scores, 0.8 + (1 - x.profile.mixing), x.rng.next());
  const g = keys[Math.max(0, idx)];
  return { guess: g, p: pr[g] };
}

function defenseOptions(x: DecideInput, role: Role): Base[] {
  const { w, id } = x;
  const s = w.state;
  const pos = w.pos[id];
  const holder = s.ball.holder!;
  const hp = w.pos[holder];
  const pw = x.personality;
  const out: Base[] = [];
  const enemyTeam = otherTeam(w.team);
  // Bote, Conter e Leitura decidem o momento do contato: prevê pelo comportamento em contato
  const inContact = true;
  const pr = w.knownAction[holder]
    ? Object.fromEntries(GUESS_KEYS.map((k) => [k, k === guessKey(w.knownAction[holder]) ? 1 : 0]))
    : predictCarrier(w.model, holder, inContact);
  const myDef = attr(w, id, 'defesa');
  const drb = attr(w, holder, 'drible');
  const fis = attr(w, holder, 'fisico') + MATCH_RULES.duel.protectBonus;
  const pas = attr(w, holder, 'passe');
  const chu = attr(w, holder, 'chute');
  const b = MATCH_RULES.duel.matrixBonus;
  const threat = danger(s, hp, enemyTeam);
  const stealValue = 5 + threat * 10;
  const sw = staminaWeight(w, id, pw);
  const reach = reachableCells(s, id).filter((c) => !occupiedByOther(w, id, c));
  const goalSide = (c: Cell) => distanceToOwnGoal(s, c, w.team) <= distanceToOwnGoal(s, hp, w.team);
  const markT = x.team.markTarget;
  const quick = (c: Cell) => {
    let v = 0;
    const dC = cheb(c, hp);
    if (role === 'pressao') v += -Math.abs(dC - 1) * 2;
    else if (role === 'marcacao' && markT) v += -cheb(c, w.pos[markT]) * 1.5;
    else if (role === 'leitor') v += -Math.abs(dC - 2) * 1.2;
    else v += -Math.abs(dC - 2) * 0.8 + (goalSide(c) ? 1.5 : 0);
    if (x.team.plan === 'bloco_baixo') v -= distanceToOwnGoal(s, c, w.team) * 0.4;
    if (x.team.plan === 'pressao_alta') v -= dC * 0.5;
    return v;
  };
  const dests = pruneDests(reach, quick, x.profile.destCap, pos);
  const legal = legalActions(s, id);
  for (const d of dests) {
    const dC = cheb(d, hp);
    const positional = (goalSide(d) ? 1.2 : 0) - dC * 0.15 + (x.team.plan === 'bloco_baixo' && distanceToOwnGoal(s, d, w.team) <= 3 ? 0.8 : 0);
    out.push({ plan: { playerId: id, dest: d, action: 'mover' }, score: positional, label: 'Mover', moved: cheb(pos, d), kind: 'def' });
    if (dC <= 1) {
      const engage = 0.85;
      // duelos seguem a matriz: Bote dá +2 ao ataque contra drible/passe/chute e +2 à defesa contra Proteger;
      // Conter dá +2 à defesa contra drible e é neutro no resto
      const pBoteSteal =
        pr.drible * (1 - pBeat(drb + b, myDef)) + pr.proteger * (1 - pBeat(fis, myDef + b)) + pr.passe * (1 - pBeat(pas + b, myDef)) + pr.chute * (1 - pBeat(chu + b, myDef));
      const pConterStop =
        pr.drible * (1 - pBeat(drb, myDef + b)) + pr.proteger * (1 - pBeat(fis, myDef)) + pr.passe * (1 - pBeat(pas, myDef)) + pr.chute * (1 - pBeat(chu, myDef));
      // custo de falhar depende do que o portador faz: quem só protege não avança
      const boteFail = pr.drible * (2 + threat * 4) + pr.passe * (1 + threat * 2) + pr.chute * threat * 3 + pr.proteger * 1.2;
      const conterFail = pr.drible * threat * 2 + pr.passe * threat * 1.5 + pr.chute * threat * 2 + pr.proteger * 0.3;
      if (legal.includes('bote')) {
        const sc = engage * (pBoteSteal * stealValue - (1 - pBoteSteal) * boteFail) * pw.press + positional - MATCH_RULES.stamina.boteCost * sw;
        out.push({ plan: { playerId: id, dest: d, action: 'bote', targetPlayer: holder }, score: sc, label: `Bote (${Math.round(pBoteSteal * 100)}%)`, moved: cheb(pos, d), kind: 'def', meta: { p: pBoteSteal } });
      }
      if (legal.includes('conter')) {
        const sc = engage * (pConterStop * stealValue - (1 - pConterStop) * conterFail) * pw.contain + positional;
        out.push({ plan: { playerId: id, dest: d, action: 'conter' }, score: sc, label: `Conter (${Math.round(pConterStop * 100)}%)`, moved: cheb(pos, d), kind: 'def', meta: { p: pConterStop } });
      }
    }
    if (legal.includes('fechar_linha')) {
      const onLane = enemies(w)
        .filter((e) => e !== holder && !s.players[e].isKeeper)
        .some((e) => line(hp, w.pos[e]).slice(1, -1).some((c) => cheb(c, d) <= 1));
      if (onLane) {
        const pInt = pr.passe * (1 - pBeat(pas, myDef + MATCH_RULES.offBall.fecharLinhaInterceptBonus));
        out.push({ plan: { playerId: id, dest: d, action: 'fechar_linha' }, score: pInt * stealValue + positional, label: `Fechar linha (${Math.round(pInt * 100)}%)`, moved: cheb(pos, d), kind: 'def' });
      }
    }
    if (legal.includes('leitura') && dC <= MATCH_RULES.duel.readRange && !w.knownAction[holder]) {
      const g = readGuess(x, holder, inContact);
      // a Leitura não inicia duelo: vale pelo Flow e pelo +3 se o portador vier até ela.
      // Na matriz, Leitura conta como "outra": drible ganha +2 de ataque.
      const engage = dC <= 1 ? 0.8 : 0.15;
      const rb = MATCH_RULES.duel.readBonus;
      const pStealIfRight =
        g.guess === 'drible' ? pr.drible * (1 - pBeat(drb + b, myDef + rb)) : g.guess === 'proteger' ? pr.proteger * (1 - pBeat(fis, myDef + rb)) * 0.3 : g.guess === 'passe' ? pr.passe * (1 - pBeat(pas, myDef + rb)) * 0.4 : 0;
      const flowValue = 0.6;
      const sc =
        engage * (pStealIfRight * stealValue * 0.9 - (1 - pStealIfRight) * threat * 2) + g.p * flowValue - (1 - g.p) * 0.9 + positional * 0.8 + (role === 'leitor' ? 0.6 : 0);
      out.push({ plan: { playerId: id, dest: d, action: 'leitura', readGuess: g.guess }, score: sc, label: `Leitura: ${g.guess}`, moved: cheb(pos, d), kind: 'def' });
    }
  }
  if (legal.includes('marcar') && markT && markT !== holder) {
    const sc = danger(s, w.pos[markT], enemyTeam) * 4 + (role === 'marcacao' ? 2.5 : 0);
    out.push({ plan: { playerId: id, dest: pos, action: 'marcar', targetPlayer: markT }, score: sc, label: `Marcar ${slotOf(s, markT).name}`, moved: 1, kind: 'def' });
  }
  return out;
}

function guessKey(action: string): string {
  if (action === 'passe_pe' || action === 'passe_espaco' || action === 'tabela') return 'passe';
  if (action === 'driblar' || action === 'conduzir') return 'drible';
  if (action === 'chutar') return 'chute';
  if (action === 'proteger') return 'proteger';
  return '';
}

// ---------------------------------------------------------------------------
// Bola solta
// ---------------------------------------------------------------------------

function looseOptions(x: DecideInput, role: Role): Base[] {
  const { w, id } = x;
  const s = w.state;
  const ball = s.ball.pos;
  const pos = w.pos[id];
  const reach = reachableCells(s, id).filter((c) => !occupiedByOther(w, id, c));
  const enemySteps = Math.min(...enemies(w).map((e) => Math.ceil(cheb(w.pos[e], ball) / Math.max(1, baseMoveRange(s, e)))), 9);
  const out: Base[] = [];
  const dests = pruneDests(reach, (c) => -cheb(c, ball) * 2 + (role === 'cobertura' ? 1 : 0), x.profile.destCap, pos);
  for (const d of dests) {
    const onBall = eq(d, ball);
    const mySteps = cheb(pos, ball) / Math.max(1, baseMoveRange(s, id));
    const win = onBall ? (mySteps <= enemySteps ? 0.7 : 0.35) : 0;
    const sc = win * 8 - cheb(d, ball) * (role === 'disputa' ? 1.2 : 0.4) + danger(s, d, w.team) * 2;
    out.push({ plan: { playerId: id, dest: d, action: 'mover' }, score: sc, label: onBall ? 'Disputar a bola' : 'Mover', moved: cheb(pos, d), kind: 'loose' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Habilidades e Flow
// ---------------------------------------------------------------------------

function effectValue(x: DecideInput, sk: SkillDef, b: Base, flow: boolean): number | null {
  const { w, id } = x;
  const s = w.state;
  const pos = w.pos[id];
  const holder = s.ball.holder;
  const params = sk.params;
  switch (sk.effect) {
    case 'extra_move':
    case 'free_jump':
    case 'panther': {
      // só vale se o destino exigir o alcance extra (ou pantera com a bola)
      const need = cheb(pos, b.plan.dest) > baseMoveRange(s, id) + (b.plan.sprint ? MATCH_RULES.movement.sprintBonus : 0);
      if (sk.effect === 'panther') return holder === id && (b.kind === 'dribble' || b.kind === 'carry') ? 5 + (b.meta?.duels ?? 0) * 2 : need ? 3 : null;
      if (sk.effect === 'free_jump') return need || (holder === id && zoneOwners(w, pos).length) ? 2.5 : null;
      return need ? 2 : null;
    }
    case 'tackle_bonus':
      return b.plan.action === 'bote' ? 0.15 * (5 + danger(s, holder ? w.pos[holder] : pos, otherTeam(w.team)) * 10) : null;
    case 'cover_ally':
      return x.team.tacklers.some((t) => t !== id) && holder && cheb(b.plan.dest, w.pos[holder]) <= 2 ? 2 : null;
    case 'zone_radius':
      return holder && s.players[holder].team !== w.team ? 3 + (distanceToOwnGoal(s, w.pos[holder], w.team) <= 4 ? 3 : 0) : null;
    case 'shot_block':
      return holder && s.players[holder].team !== w.team && line(w.pos[holder], pos).length <= 6 ? 3 : null;
    case 'peek_carrier_action':
    case 'spatial_read':
    case 'metavision':
      return 2 + (evalCondition('nearOpponentBox', condCtx(x, b)) ? 1.5 : 0);
    case 'ego_awake':
      // +2 em Chute e Visão por 2 lances: forte perto da área
      return 3 + (evalCondition('nearOpponentBox', condCtx(x, b)) ? 2.5 : 0);
    case 'perfect_ginga':
      return holder === id ? 5 + (b.meta?.duels ?? 0) * 1.5 : null;
    case 'improvise':
      return holder === id && b.kind !== 'protect' ? 1.5 : null;
    case 'late_move':
      return holder !== id ? 1.5 : null;
    case 'accel_trail': {
      const d = cheb(pos, b.plan.dest);
      return isStraight(pos, b.plan.dest) && d >= (params.minCells ?? 4) ? 2.5 + (evalCondition('onWing', condCtx(x, b)) ? 1 : 0) : null;
    }
    case 'speed_shot': {
      if (b.plan.action !== 'chutar' || b.moved < (params.minCells ?? 3)) return null;
      const bonus = Math.min(b.moved, params.maxBonus ?? 4);
      const p1 = shotEstimate(w, id, stepPath(pos, b.plan.dest).slice(-1)[0] ?? pos, b.plan.shotZone ?? 1, bonus);
      return (p1 - (b.meta?.p ?? 0)) * GOAL_VALUE;
    }
    case 'direct_shot': {
      if (b.plan.action !== 'finalizar_primeira') return null;
      const p1 = shotEstimate(w, id, b.plan.dest, b.plan.shotZone ?? 1, params.bonus ?? 3);
      return (p1 - (b.meta?.p ?? 0)) * GOAL_VALUE * (b.meta?.pRecv ?? 0.3) * 2;
    }
    case 'puzzle_piece': {
      if (b.plan.action !== 'finalizar_primeira') return null;
      const p1 = shotEstimate(w, id, b.plan.dest, 1, params.bonus ?? 6, true);
      return (p1 - (b.meta?.p ?? 0)) * GOAL_VALUE * (b.meta?.pRecv ?? 0.3) * 2;
    }
    case 'ginga_rhythm':
      return holder === id ? 1.5 + (b.kind === 'dribble' ? 1 : 0) : null;
    case 'samba':
      return b.plan.action === 'driblar' && (b.meta?.duels ?? 0) >= 1 ? 1 + (b.meta?.duels ?? 0) : null;
    case 'curve_pass': {
      if (!(b.kind === 'pass' || b.kind === 'space') || !(b.meta?.interceptors ?? 0)) return null;
      return 2.5;
    }
    case 'stamina_refill_allplus':
      // +1 em tudo por 2 lances vale mais quando há duelo ou fôlego baixo
      return (s.players[id].stamina < 40 ? 4 : 2) + (evalCondition('duelLikely', condCtx(x, b)) ? 1.5 : 0);
    case 'devour': {
      const src = devourSource(s, id);
      if (!src) return null;
      const inner = findSkill(src);
      return inner ? effectValue(x, inner, b, false) : null;
    }
    default:
      return null;
  }
}

function condCtx(x: DecideInput, b: Base, passInterceptors?: number): CondCtx {
  return {
    w: x.w,
    id: x.id,
    action: b.plan.action,
    dest: b.plan.dest,
    role: x.team.roles[x.id] ?? 'cobertura',
    turnsLeft: turnsLeft(x.w),
    tacklers: x.team.tacklers,
    revelation: x.revelation,
    passInterceptors,
  };
}

function withSkills(x: DecideInput, bases: Base[]): Base[] {
  const { w, id } = x;
  const s = w.state;
  const me = s.players[id];
  const slot = slotOf(s, id);
  const out: Base[] = [];
  const top = [...bases].sort((a, b) => b.score - a.score).slice(0, 8);
  const sw = staminaWeight(w, id, x.personality);
  for (const b of top) {
    const opts = skillOptions(s, id, b.plan.action).filter((o) => o.usable);
    for (const o of opts) {
      const def = findSkill(o.skillId)!;
      const isFlow = def.kind === 'flow';
      if (isFlow && (x.noFlow || me.flow < MATCH_RULES.flow.max)) continue;
      const ctx = condCtx(x, b, b.meta?.interceptors);
      const conds = def.ai.conditions.every((c) => evalCondition(c, ctx));
      if (!conds) continue;
      const ev = effectValue(x, def, b, isFlow);
      if (ev === null || ev <= 0) continue;
      let v = ev * x.profile.skillQuality + def.ai.priority * 0.15 * x.profile.skillQuality;
      if (x.profile.skillContext) v += (def.ai.bonusIf ?? []).filter((c) => evalCondition(c, ctx)).length * 0.8;
      if (isFlow) {
        // Flow é guardado para momentos de alto valor
        const moment = ['nearOpponentBox', 'counterAttackAgainst', 'counterAttackFor', 'closeScoreLate'].some((c) => evalCondition(c as never, ctx));
        if (!moment && v < x.profile.flowThreshold * 1.5) continue;
        if (v < x.profile.flowThreshold) continue;
      } else {
        v -= o.stamina * sw;
        // não usa só porque saiu da recarga: recargas longas pedem momentos melhores
        if (v < 1 + skillFor(s, id, o.skillId).cooldown * 0.35) continue;
      }
      const plan: Plan = isFlow ? { ...b.plan, useFlow: true } : { ...b.plan, skill: o.skillId };
      if (def.target === 'ally') {
        const ally = x.team.tacklers.find((t) => t !== id) ?? allies(w).filter((a) => a !== id).sort((p, q) => cheb(w.pos[p], w.pos[id]) - cheb(w.pos[q], w.pos[id]))[0];
        if (!ally) continue;
        plan.skillTarget = ally;
      }
      if (!validatePlan(s, plan).ok) continue;
      out.push({ ...b, plan, score: b.score + v, label: `${b.label} + ${def.name}` });
    }
  }
  // movimento extra por habilidade: destinos além do alcance normal
  const extra = skillOptions(s, id).filter((o) => o.usable && ['extra_move', 'free_jump', 'panther'].includes(findSkill(o.skillId)!.effect));
  for (const o of extra) {
    const def = findSkill(o.skillId)!;
    const isFlow = def.kind === 'flow';
    if (isFlow && (x.noFlow || me.flow < MATCH_RULES.flow.max)) continue;
    const planProbe = isFlow ? { useFlow: true } : { skill: o.skillId };
    const cells = reachableCells(s, id, planProbe).filter((c) => cheb(c, w.pos[id]) > planMoveRange(s, id, {}) && !occupiedByOther(w, id, c));
    const holderId = s.ball.holder;
    const defending = !!holderId && s.players[holderId].team !== me.team;
    const carrierPos = holderId ? w.pos[holderId] : null;
    // defendendo: só vale para chegar em quem tem a bola (fechar contra-ataque)
    const ranked = defending && carrierPos
      ? cells.filter((c) => cheb(c, carrierPos) <= 1).sort((p, q) => distanceToOwnGoal(s, p, w.team) - distanceToOwnGoal(s, q, w.team))
      : cells.sort((p, q) => danger(s, q, w.team) - danger(s, p, w.team));
    for (const d of ranked.slice(0, 3)) {
      const holder = holderId === id;
      const action: ActionKind = holder ? (def.effect === 'free_jump' ? 'conduzir' : 'driblar') : defending ? 'conter' : 'desmarque';
      if (!legalActions(s, id).includes(action)) continue;
      const plan: Plan = { playerId: id, dest: d, action, ...planProbe };
      if (!validatePlan(s, plan).ok) continue;
      const b: Base = { plan, score: 0, label: `${action} + ${def.name}`, moved: cheb(w.pos[id], d), kind: holder ? 'dribble' : defending ? 'def' : 'off' };
      const ctx = condCtx(x, b);
      if (!def.ai.conditions.every((c) => evalCondition(c, ctx))) continue;
      let sc: number;
      if (holder) {
        const est = def.effect === 'free_jump' ? { p: 1, end: d } : dribbleEstimate(x.w, id, w.pos[id], d, 0, def.effect === 'panther');
        sc = est.p * V(w, est.end) + (1 - est.p) * L(w, w.pos[id]);
      } else if (defending && carrierPos) {
        // chega onde o alcance normal não chegava: vale mais em contra-ataque
        const threat = danger(s, carrierPos, otherTeam(w.team));
        sc = 1.5 + threat * 5 + (evalCondition('counterAttackAgainst', ctx) ? 2 : 0);
      } else sc = danger(s, d, w.team) * 6 + Math.min(openness(w, d), 3) * 0.8;
      sc += def.ai.priority * 0.15 - (isFlow ? 0 : o.stamina * sw);
      if (isFlow && sc < x.profile.flowThreshold) continue;
      out.push({ ...b, score: sc });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diretiva do combo
// ---------------------------------------------------------------------------

function applyDirective(x: DecideInput, bases: Base[]): Base[] {
  const dir = x.team.combo?.directives[x.id];
  if (!dir) return bases;
  const bonus = 1.2 * x.personality.combo;
  const plan: Plan = {
    playerId: x.id,
    dest: dir.dest,
    action: dir.action,
    targetPlayer: dir.targetPlayer ?? null,
    targetCell: dir.targetCell ?? null,
    shotZone: 1,
    readGuess: 'drible',
  };
  if (dir.skill) plan.skill = dir.skill;
  const chk = validatePlan(x.w.state, plan);
  if (!chk.ok && dir.skill) {
    delete plan.skill;
  }
  const chk2 = validatePlan(x.w.state, plan);
  if (!chk2.ok) return bases;
  const score = directiveScore(x, chk2.plan, bases);
  if (score === null) return bases;
  // o combo vale pelo que a jogada é, mais um bônus pequeno de coordenação
  return [...bases, { plan: chk2.plan, score: score + bonus, label: `Combo: ${x.team.combo!.name}`, moved: cheb(x.w.pos[x.id], dir.dest), kind: 'off' }];
}

/** Avalia a jogada pedida pelo combo com as mesmas contas das outras opções. */
function directiveScore(x: DecideInput, p: Plan, bases: Base[]): number | null {
  const { w, id } = x;
  const pos = w.pos[id];
  // mesma ação, mesmo destino e mesmo alvo: já avaliada
  const exact = bases.find(
    (b) => b.plan.action === p.action && eq(b.plan.dest, p.dest) && (b.plan.targetPlayer ?? null) === (p.targetPlayer ?? null) && !b.plan.targetCell === !p.targetCell,
  );
  if (exact && !p.targetCell) return exact.score;
  if (p.action === 'passe_espaco' && p.targetCell) {
    const bonus = MATCH_RULES.offBall.spaceReceptionBonus + MATCH_RULES.offBall.desmarqueReceptionBonus;
    const est = passEstimate(w, id, pos, p.targetCell, bonus);
    const pOk = est.p * contactKeep(w, id, pos, 'passar') * 0.85;
    return (pOk * V(w, p.targetCell) + (1 - pOk) * L(w, p.targetCell) * x.personality.risk) * x.personality.pass;
  }
  if (p.action === 'driblar') {
    const est = dribbleEstimate(w, id, pos, p.dest);
    return est.p * V(w, est.end) + (1 - est.p) * L(w, pos) * x.personality.risk;
  }
  // sem avaliação própria: a melhor opção com a mesma ação no mesmo destino, ou pouco abaixo da melhor com a mesma ação
  const sameDest = bases.filter((b) => b.plan.action === p.action && eq(b.plan.dest, p.dest)).sort((a, b) => b.score - a.score)[0];
  if (sameDest) return sameDest.score;
  const same = bases.filter((b) => b.plan.action === p.action).sort((a, b) => b.score - a.score)[0];
  if (same) return same.score - 0.5;
  // ação que o bot não tinha considerado (corta-luz, tabela do parceiro): usa a média
  if (!bases.length) return null;
  return bases.reduce((a, b) => a + b.score, 0) / bases.length;
}

// ---------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------

export function decide(x: DecideInput): { plan: Plan; options: ScoredOption[] } {
  const { w, id } = x;
  const s = w.state;
  const holder = s.ball.holder;
  const role: Role = x.team.roles[id] ?? 'cobertura';
  let bases: Base[];
  if (holder === id) bases = carrierOptions(x);
  else if (!holder) bases = looseOptions(x, role);
  else if (s.players[holder].team === w.team) bases = attackOptions(x, role);
  else bases = defenseOptions(x, role);

  // estilo da linhagem
  const bias = getLineage(slotOf(s, id).lineageId).playstyle.actionBias;
  for (const b of bases) b.score += (bias[b.plan.action] ?? 0) * 3;

  bases = applyDirective(x, bases);
  const all = [...bases, ...withSkills(x, bases)];

  let pool = all;
  if (x.restrict) {
    const r = x.restrict;
    pool = all.filter((b) => {
      if (!r.allowDest && !eq(b.plan.dest, r.base.dest)) return false;
      if (!r.allowAction && b.plan.action !== r.base.action) return false;
      if (r.ballActionOnly && b.plan.skill) return false;
      return !b.plan.useFlow && (!b.plan.skill || b.plan.skill === r.base.skill);
    });
    pool = pool.map((b) => ({ ...b, plan: { ...b.plan, skill: r.base.skill, useFlow: r.base.useFlow, sprint: r.base.sprint } }));
  }
  const valid = pool.filter((b) => validatePlan(s, b.plan).ok);
  if (!valid.length) {
    const fallback: Plan = x.restrict?.base ?? { playerId: id, dest: w.pos[id], action: legalActions(s, id)[0] };
    return { plan: fallback, options: [] };
  }
  valid.sort((a, b) => b.score - a.score);
  const best = valid[0].score;
  // descarta opções absurdamente piores: erros plausíveis, nunca absurdos
  const plausible = valid.filter((b) => b.score >= best - x.profile.plausibleWindow).slice(0, 12);
  const idx = softmaxPick(plausible, plausible.map((b) => b.score), x.profile.temperature, x.rng.next());
  const chosen = plausible[Math.max(0, idx)];
  return {
    plan: { ...chosen.plan, auto: true },
    options: valid.slice(0, 3).map((b) => ({ plan: b.plan, score: Math.round(b.score * 100) / 100, label: b.label })),
  };
}

export { effectiveAttrs };
