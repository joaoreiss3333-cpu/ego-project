import {
  PLAYBOOK,
  RARITY_COST,
  getLineage,
  type ActionKind,
  type ComboDef,
  type ComboPrecondition,
  type DestRule,
  type RolePick,
} from '@ego/content';
import { cheb, eq, inBounds, line, type Cell } from '../grid';
import { reachableCells } from '../mechanics';
import { validatePlan } from '../plan';
import type { Rng } from '../rng';
import { slotOf } from '../setup';
import { otherTeam, type MatchState, type Plan, type Team } from '../types';
import { counterAttack, turnsLeft } from './conditions';
import { allies, danger, distanceToGoal, distanceToOwnGoal, enemies, inOwnHalf, lastLineX, openness, passEstimate, type World } from './evaluate';
import type { DifficultyProfile, PersonalityWeights } from './profile';

export type TeamPlanKind =
  | 'construcao'
  | 'contra_ataque'
  | 'ponta'
  | 'craque'
  | 'segurar'
  | 'pressao_alta'
  | 'bloco_medio'
  | 'bloco_baixo'
  | 'individual'
  | 'bola_solta';

export const TEAM_PLAN_LABEL: Record<TeamPlanKind, string> = {
  construcao: 'Construção paciente',
  contra_ataque: 'Contra-ataque',
  ponta: 'Ataque pela ponta',
  craque: 'Jogar para o craque',
  segurar: 'Segurar resultado',
  pressao_alta: 'Pressão alta',
  bloco_medio: 'Bloco médio',
  bloco_baixo: 'Bloco baixo',
  individual: 'Marcação individual no craque',
  bola_solta: 'Disputa de bola solta',
};

export type Role = 'portador' | 'apoio' | 'profundidade' | 'isca' | 'cobertura' | 'pressao' | 'marcacao' | 'leitor' | 'goleiro' | 'disputa';

export const ROLE_LABEL: Record<Role, string> = {
  portador: 'Portador',
  apoio: 'Apoio curto',
  profundidade: 'Profundidade',
  isca: 'Isca',
  cobertura: 'Cobertura',
  pressao: 'Pressão',
  marcacao: 'Marcação individual',
  leitor: 'Leitor',
  goleiro: 'Goleiro',
  disputa: 'Disputa',
};

export interface Directive {
  comboId: string;
  action: ActionKind;
  dest: Cell;
  targetPlayer?: string | null;
  targetCell?: Cell | null;
  skill?: string | null;
}

export interface TeamDecision {
  team: Team;
  plan: TeamPlanKind;
  roles: Record<string, Role>;
  combo: { id: string; name: string; directives: Record<string, Directive> } | null;
  star: string | null;
  enemyStar: string | null;
  markTarget: string | null;
  tacklers: string[];
  /** Plano do portador bot do time (decidido primeiro): os companheiros jogam em cima dele. */
  carrierPlan?: Plan | null;
}

function rarityOf(state: MatchState, id: string): number {
  return RARITY_COST[getLineage(slotOf(state, id).lineageId).rarity];
}

function advancement(state: MatchState, id: string, team: Team, pos: Cell): number {
  return -distanceToGoal(state, pos, team);
}

export function chooseTeamPlan(w: World, bots: string[]): TeamDecision {
  const s = w.state;
  const team = w.team;
  const holder = s.ball.holder;
  const ours = allies(w);
  const theirs = enemies(w);
  const diff = s.score[team] - s.score[otherTeam(team)];
  const left = turnsLeft(w);
  const roles: Record<string, Role> = {};
  let plan: TeamPlanKind;
  let star: string | null = null;
  let enemyStar: string | null = null;
  let markTarget: string | null = null;

  const keeper = s.order.find((id) => s.players[id].team === team && s.players[id].isKeeper);
  if (keeper) roles[keeper] = 'goleiro';

  // craques: maior raridade de cada lado
  const byRarity = (ids: string[]) => [...ids].sort((a, b) => rarityOf(s, b) - rarityOf(s, a) || s.order.indexOf(a) - s.order.indexOf(b));
  const ourTop = byRarity(ours)[0];
  if (ourTop && ours.length > 1 && rarityOf(s, ourTop) >= 3) star = ourTop;
  const theirTop = byRarity(theirs)[0];
  if (theirTop && rarityOf(s, theirTop) >= 4) enemyStar = theirTop;

  if (!holder) {
    plan = 'bola_solta';
    const sorted = [...ours].sort((a, b) => cheb(w.pos[a], s.ball.pos) - cheb(w.pos[b], s.ball.pos));
    sorted.forEach((id, i) => (roles[id] = i === 0 ? 'disputa' : i === 1 ? 'apoio' : 'cobertura'));
  } else if (s.players[holder].team === team) {
    const hp = w.pos[holder];
    if (diff > 0 && left <= 4) plan = 'segurar';
    else if (counterAttack(w, team)) plan = 'contra_ataque';
    else if (star && star !== holder && openness(w, w.pos[star]) >= 2) plan = 'craque';
    else if (hp.y <= 1 || hp.y >= s.setup.field.height - 2) plan = 'ponta';
    else plan = 'construcao';
    if (!s.players[holder].isKeeper) roles[holder] = 'portador';
    const rest = ours.filter((id) => id !== holder);
    const byDist = [...rest].sort((a, b) => cheb(w.pos[a], hp) - cheb(w.pos[b], hp));
    const byAdv = [...rest].sort((a, b) => advancement(s, b, team, w.pos[b]) - advancement(s, a, team, w.pos[a]));
    if (byDist[0]) roles[byDist[0]] = 'apoio';
    const deep = byAdv.find((id) => !roles[id]);
    if (deep) roles[deep] = 'profundidade';
    const bait = byAdv.find((id) => !roles[id]);
    if (bait) roles[bait] = rest.length >= 3 ? 'isca' : 'cobertura';
    for (const id of rest) if (!roles[id]) roles[id] = 'cobertura';
    if (plan === 'craque' && star) roles[star] = 'profundidade';
  } else {
    const hp = w.pos[holder];
    if ((diff > 0 && left <= 4) || distanceToOwnGoal(s, hp, team) <= 3) plan = 'bloco_baixo';
    else if (!inOwnHalf(s, hp, team) && (diff < 0 || left > 10)) plan = 'pressao_alta';
    else if (enemyStar && enemyStar !== holder && ours.length >= 2) plan = 'individual';
    else plan = 'bloco_medio';
    const byDist = [...ours].sort((a, b) => cheb(w.pos[a], hp) - cheb(w.pos[b], hp));
    if (byDist[0]) roles[byDist[0]] = 'pressao';
    if (plan === 'individual' && enemyStar) {
      const marker = [...ours].filter((id) => !roles[id]).sort((a, b) => cheb(w.pos[a], w.pos[enemyStar!]) - cheb(w.pos[b], w.pos[enemyStar!]))[0];
      if (marker) {
        roles[marker] = 'marcacao';
        markTarget = enemyStar;
      }
    }
    let leitorGiven = false;
    for (const id of byDist) {
      if (roles[id]) continue;
      if (!leitorGiven && cheb(w.pos[id], hp) <= 4) {
        roles[id] = 'leitor';
        leitorGiven = true;
      } else roles[id] = 'cobertura';
    }
    if (!markTarget) {
      // atacante mais perigoso sem bola
      const threats = theirs.filter((e) => e !== holder).sort((a, b) => danger(s, w.pos[b], otherTeam(team)) - danger(s, w.pos[a], otherTeam(team)));
      markTarget = threats[0] ?? null;
    }
  }

  return {
    team,
    plan,
    roles,
    combo: null,
    star,
    enemyStar,
    markTarget,
    tacklers: Object.entries(roles)
      .filter(([, r]) => r === 'pressao')
      .map(([id]) => id)
      .filter((id) => bots.includes(id)),
  };
}

// ---------------------------------------------------------------------------
// Playbook
// ---------------------------------------------------------------------------

function checkPre(w: World, pre: ComboPrecondition, bots: string[]): boolean {
  const s = w.state;
  const holder = s.ball.holder;
  const ours = allies(w);
  const hp = holder ? w.pos[holder] : null;
  const weHave = !!holder && s.players[holder].team === w.team;
  switch (pre) {
    case 'weHaveBall':
      return weHave && !s.players[holder!].isKeeper;
    case 'theyHaveBall':
      return !!holder && !weHave;
    case 'allyAdjacentToCarrier':
      return !!hp && ours.some((a) => a !== holder && bots.includes(a) && cheb(w.pos[a], hp) <= 1);
    case 'allyWithin2OfCarrier':
      return !!hp && ours.some((a) => a !== holder && bots.includes(a) && cheb(w.pos[a], hp) <= 2);
    case 'spaceBehindLastLine': {
      const f = s.setup.field;
      const ll = lastLineX(w);
      const gx = w.team === 'A' ? f.width - 1 : 0;
      return Math.abs(gx - ll) >= 2;
    }
    case 'twoAttackersAvailable':
      return ours.filter((a) => a !== holder).length >= 1;
    case 'defenderAdjacentToCarrier':
      return !!hp && enemies(w).some((e) => cheb(w.pos[e], hp) <= 1);
    case 'twoDefendersNearCarrier':
      return !!hp && ours.filter((a) => bots.includes(a) && cheb(w.pos[a], hp) <= 3).length >= 2;
    case 'threeDefendersAvailable':
      return ours.filter((a) => bots.includes(a)).length >= 3;
    case 'carrierInOpponentHalf':
      return !!hp && !inOwnHalf(s, hp, w.team);
    case 'carrierNotInOwnBox':
      return !!hp && distanceToOwnGoal(s, hp, w.team) > 2;
    case 'opponentCarrierInOurHalf':
      return !!hp && !weHave && inOwnHalf(s, hp, w.team);
    default:
      return false;
  }
}

function pickRole(w: World, pick: RolePick, bots: string[], used: Set<string>): string | null {
  const s = w.state;
  const holder = s.ball.holder;
  if (!holder) return null;
  const hp = w.pos[holder];
  const free = allies(w).filter((a) => bots.includes(a) && !used.has(a) && a !== holder);
  const byDist = [...free].sort((a, b) => cheb(w.pos[a], hp) - cheb(w.pos[b], hp));
  const byAdv = [...free].sort((a, b) => distanceToGoal(s, w.pos[a], w.team) - distanceToGoal(s, w.pos[b], w.team));
  switch (pick) {
    case 'carrier':
      return bots.includes(holder) && !used.has(holder) ? holder : null;
    case 'nearestAllyToCarrier':
    case 'nearestDefenderToCarrier':
      return byDist[0] ?? null;
    case 'secondNearestDefenderToCarrier':
      return byDist[1] ?? byDist[0] ?? null;
    case 'farthestDefenderFromCarrier':
      return byDist[byDist.length - 1] ?? null;
    case 'deepestAttacker':
      return byAdv[0] ?? null;
    case 'secondDeepestAttacker':
      return byAdv[1] ?? null;
    default:
      return null;
  }
}

function bestReachable(w: World, id: string, score: (c: Cell) => number): Cell {
  const cells = reachableCells(w.state, id);
  let best = w.pos[id];
  let bs = -Infinity;
  for (const c of cells) {
    if (w.state.order.some((o) => o !== id && eq(w.pos[o], c))) continue;
    const v = score(c);
    if (v > bs) {
      bs = v;
      best = c;
    }
  }
  return best;
}

function destFor(w: World, rule: DestRule, id: string, assigned: Record<string, string>): Cell {
  const s = w.state;
  const holder = s.ball.holder!;
  const hp = w.pos[holder];
  const me = w.pos[id];
  const f = s.setup.field;
  const dir = w.team === 'A' ? 1 : -1;
  const lane = (targetId: string | undefined) => {
    if (!targetId) return hp;
    const pts = line(hp, w.pos[targetId]);
    return pts[Math.floor(pts.length / 2)];
  };
  switch (rule) {
    case 'stay':
      return me;
    case 'forwardFree':
      return bestReachable(w, id, (c) => danger(s, c, w.team) * 10 + Math.min(openness(w, c), 3) * 0.6);
    case 'adjacentToCarrier':
      return bestReachable(w, id, (c) => (cheb(c, hp) === 1 ? 5 : -cheb(c, hp)) + danger(s, c, w.team));
    case 'behindLastLine': {
      const ll = lastLineX(w);
      // alvo: atrás da última linha, nunca recuando
      const tx = dir > 0 ? Math.max(ll + 2, me.x) : Math.min(ll - 2, me.x);
      return bestReachable(w, id, (c) => -Math.abs(c.x - tx) * 2 - Math.abs(c.y - me.y) * 0.3 + Math.min(openness(w, c), 3) + danger(s, c, w.team) * 3 + passEstimate(w, holder, hp, c).p * 5);
    }
    case 'awayFromCarrierWide': {
      const wideY = hp.y < f.height / 2 ? f.height - 1 : 0;
      return bestReachable(w, id, (c) => -Math.abs(c.y - wideY) + (c.x - me.x) * dir * 0.5 + passEstimate(w, holder, hp, c).p);
    }
    case 'besideBlockedDefender':
      return me;
    case 'towardCarrier':
      return bestReachable(w, id, (c) => -Math.abs(cheb(c, hp) - 1) * 3 - distanceToOwnGoal(s, c, w.team) * 0.2);
    case 'keepDistance2':
      return bestReachable(w, id, (c) => -Math.abs(cheb(c, hp) - 2) * 2 - distanceToOwnGoal(s, c, w.team) * 0.5);
    case 'onPassLaneToDeepest':
    case 'onPassLaneToSecond': {
      const attackers = enemies(w)
        .filter((e) => e !== holder)
        .sort((a, b) => distanceToGoal(s, w.pos[a], otherTeam(w.team)) - distanceToGoal(s, w.pos[b], otherTeam(w.team)));
      const target = rule === 'onPassLaneToDeepest' ? attackers[0] : (attackers[1] ?? attackers[0]);
      const mid = lane(target);
      return bestReachable(w, id, (c) => -cheb(c, mid) * 2);
    }
    case 'returnToPartner':
      return assigned.portador ? w.pos[assigned.portador] : me;
    default:
      return me;
  }
}

/** Tenta ativar um combo do playbook com os bots do time. */
export function chooseCombo(
  w: World,
  decision: TeamDecision,
  bots: string[],
  profile: DifficultyProfile,
  personality: PersonalityWeights,
  rng: Rng,
): TeamDecision['combo'] {
  const holder = w.state.ball.holder;
  if (!holder) return null;
  const side: 'attack' | 'defense' = w.state.players[holder].team === w.team ? 'attack' : 'defense';
  const options: { combo: ComboDef; directives: Record<string, Directive>; score: number }[] = [];
  for (const combo of PLAYBOOK) {
    if (combo.side !== side || !profile.comboTiers.includes(combo.minDifficulty)) continue;
    if (!combo.preconditions.every((p) => checkPre(w, p, bots))) continue;
    const used = new Set<string>();
    const assigned: Record<string, string> = {};
    let ok = true;
    for (const st of combo.steps) {
      const id = pickRole(w, st.pick, bots, used);
      if (!id) {
        ok = false;
        break;
      }
      used.add(id);
      assigned[st.role] = id;
    }
    if (!ok) continue;
    const directives: Record<string, Directive> = {};
    for (const st of combo.steps) {
      const id = assigned[st.role];
      const dest = destFor(w, st.dest, id, assigned);
      const d: Directive = { comboId: combo.id, action: st.action, dest };
      if (st.target?.startsWith('role:')) {
        const other = assigned[st.target.slice(5)];
        if (st.action === 'passe_espaco') d.targetCell = null;
        else d.targetPlayer = other;
      } else if (st.target === 'opponentCarrier') d.targetPlayer = holder;
      else if (st.target === 'nearestEnemy') {
        const adj = enemies(w)
          .filter((e) => cheb(w.pos[e], w.pos[id]) <= 1)
          .sort((a, b) => cheb(w.pos[a], w.pos[holder]) - cheb(w.pos[b], w.pos[holder]))[0];
        if (!adj) {
          ok = false;
          break;
        }
        d.targetPlayer = adj;
      }
      directives[id] = d;
    }
    if (!ok) continue;
    // destinos de passe no espaço apontam para o destino de quem ataca o espaço
    for (const st of combo.steps) {
      const id = assigned[st.role];
      if (st.action === 'passe_espaco' && st.target?.startsWith('role:')) {
        const other = assigned[st.target.slice(5)];
        directives[id].targetCell = directives[other]?.dest ?? w.pos[other];
      }
    }
    // valida contra as regras: combo com plano inválido é descartado
    const valid = Object.entries(directives).every(([id, d]) => {
      const p: Plan = { playerId: id, dest: d.dest, action: d.action, targetPlayer: d.targetPlayer, targetCell: d.targetCell, shotZone: 1, readGuess: 'drible' };
      if (d.targetCell && !inBounds(d.targetCell, w.state.setup.field)) return false;
      return validatePlan(w.state, p).ok;
    });
    if (!valid) continue;
    let score = combo.weight * personality.combo * (0.75 + rng.next() * 0.5);
    // combos da linhagem: habilidades que declaram combinar com este combo
    if (profile.lineageCombos) {
      for (const id of Object.keys(directives)) {
        const l = getLineage(slotOf(w.state, id).lineageId);
        if (l.skills.some((sk) => sk.ai.combosWith?.includes(combo.id))) score += 0.4;
      }
    }
    options.push({ combo, directives, score });
  }
  if (!options.length) return null;
  if (rng.next() > profile.comboChance) return null;
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  // no chefe, liga a habilidade da linhagem que combina com o combo
  if (profile.lineageCombos) {
    for (const [id, d] of Object.entries(best.directives)) {
      const slot = slotOf(w.state, id);
      const sk = getLineage(slot.lineageId).skills.find((x) => x.ai.combosWith?.includes(best.combo.id) && slot.loadout.active.includes(x.id));
      if (sk) d.skill = sk.id;
    }
  }
  return { id: best.combo.id, name: best.combo.name, directives: best.directives };
}
