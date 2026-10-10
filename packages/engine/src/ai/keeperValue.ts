import type { Cell } from '../grid';
import { otherTeam } from '../types';
import { danger, openness, type World } from './evaluate';

/** Valor de uma saída de bola do goleiro para uma casa. */
export function V_keeperPass(w: World, to: Cell, p: number): number {
  const gain = 2 + danger(w.state, to, w.team) * 6 + Math.min(openness(w, to), 3) * 0.8;
  const loss = 4 + danger(w.state, to, otherTeam(w.team)) * 12;
  return p * gain - (1 - p) * loss;
}
