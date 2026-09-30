import type { ActionKind, AiCondition } from '@ego/content';
import { cheb, isStraight, type Cell } from '../grid';
import { effectiveAttrs } from '../mechanics';
import { otherTeam } from '../types';
import type { PublicArrow } from '../revelation';
import { allies, distanceToGoal, enemies, inOwnHalf, passEstimate, type World } from './evaluate';

export interface CondCtx {
  w: World;
  id: string;
  action: ActionKind;
  dest: Cell;
  /** Função do bot no plano do time. */
  role: string;
  turnsLeft: number;
  /** Aliados que o coordenador mandou dar bote. */
  tacklers: string[];
  /** Revelação pública (só na janela de reação). */
  revelation?: PublicArrow[];
  passInterceptors?: number;
}

export function turnsLeft(w: World): number {
  const s = w.state.setup;
  const total = s.halves * s.turnsPerHalf;
  return Math.max(0, total - (w.state.turn - 1));
}

export function counterAttack(w: World, attackingTeam: 'A' | 'B'): boolean {
  const s = w.state;
  const holder = s.ball.holder;
  if (!holder || s.players[holder].team !== attackingTeam) return false;
  const ball = w.pos[holder];
  const defTeam = otherTeam(attackingTeam);
  const f = s.setup.field;
  const defGoalX = defTeam === 'A' ? 0 : f.width - 1;
  // defensores entre a bola e o próprio gol
  const behind = s.order.filter((id) => {
    const p = s.players[id];
    if (p.team !== defTeam || p.isKeeper) return false;
    return Math.abs(w.pos[id].x - defGoalX) < Math.abs(ball.x - defGoalX);
  }).length;
  const attackersAhead = s.order.filter((id) => {
    const p = s.players[id];
    if (p.team !== attackingTeam || p.isKeeper) return false;
    return Math.abs(w.pos[id].x - defGoalX) <= Math.abs(ball.x - defGoalX) + 1;
  }).length;
  return behind < attackersAhead && distanceToGoal(s, ball, attackingTeam) <= f.width * 0.75;
}

export function evalCondition(c: AiCondition, x: CondCtx): boolean {
  const { w, id } = x;
  const s = w.state;
  const me = s.players[id];
  const holder = s.ball.holder;
  const pos = w.pos[id];
  const diff = s.score[me.team] - s.score[otherTeam(me.team)];
  switch (c) {
    case 'hasBall':
      return holder === id;
    case 'noBall':
      return holder !== id;
    case 'defending':
      return !!holder && s.players[holder].team !== me.team;
    case 'attacking':
      return !!holder && s.players[holder].team === me.team;
    case 'nearOpponentBox':
      return Math.min(distanceToGoal(s, pos, me.team), distanceToGoal(s, x.dest, me.team)) <= 3;
    case 'inOwnHalf':
      return inOwnHalf(s, pos, me.team);
    case 'opponentHasShotPosition':
      return !!holder && s.players[holder].team !== me.team && distanceToGoal(s, w.pos[holder], s.players[holder].team) <= 5;
    case 'leadingScore':
      return diff > 0;
    case 'trailingScore':
      return diff < 0;
    case 'closeScoreLate':
      return Math.abs(diff) <= 1 && x.turnsLeft <= 4;
    case 'counterAttackAgainst':
      return counterAttack(w, otherTeam(me.team));
    case 'counterAttackFor':
      return counterAttack(w, me.team);
    case 'onWing':
      return x.dest.y <= 1 || x.dest.y >= s.setup.field.height - 2;
    case 'longStraightRun':
      return isStraight(pos, x.dest) && cheb(pos, x.dest) >= 4;
    case 'movedFarThisTurn':
      return cheb(pos, x.dest) >= 3;
    case 'allyHighPassReady':
      return !!holder && holder !== id && s.players[holder].team === me.team && effectiveAttrs(s, holder).passe >= 7 && passEstimate(w, holder, w.pos[holder], x.dest).p >= 0.45;
    case 'readingAgainstMe':
      return !!x.revelation?.some((a) => a.reading && s.players[a.playerId].team !== me.team && cheb(a.dest, x.dest) <= 3);
    case 'weakDefenderAhead': {
      const dr = effectiveAttrs(s, id).drible;
      const dir = me.team === 'A' ? 1 : -1;
      return enemies(w).some((e) => {
        const ep = w.pos[e];
        return (ep.x - pos.x) * dir >= 0 && cheb(ep, pos) <= 3 && effectiveAttrs(s, e).defesa <= dr - 2;
      });
    }
    case 'allyWillTackle':
      return x.tacklers.some((t) => t !== id && holder && cheb(w.pos[t], w.pos[holder]) <= 2);
    case 'duelLikely':
      if (holder === id) return enemies(w).some((e) => cheb(w.pos[e], x.dest) <= 2 || cheb(w.pos[e], pos) <= 2);
      return !!holder && s.players[holder].team !== me.team && cheb(w.pos[holder], x.dest) <= 2;
    case 'enemyAdjacent':
      return enemies(w).some((e) => cheb(w.pos[e], pos) <= 1);
    case 'receivingPassLikely':
      return !!holder && holder !== id && s.players[holder].team === me.team && passEstimate(w, holder, w.pos[holder], x.dest).p >= 0.5;
    case 'defenderOnPassLine':
      return (x.passInterceptors ?? 0) > 0;
    case 'lowStamina':
      return me.stamina < 35;
    case 'rhythmStacksFull':
      return me.rhythm >= 3;
    default:
      return false;
  }
}

export function alliesOf(w: World) {
  return allies(w);
}
