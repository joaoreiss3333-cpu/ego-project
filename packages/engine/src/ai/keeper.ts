import { MATCH_RULES, type GoalZone } from '@ego/content';
import { cheb, goalRows, isInArea, ownGoalX, type Cell } from '../grid';
import { effectiveAttrs, reachableCells } from '../mechanics';
import type { Rng } from '../rng';
import type { Plan } from '../types';
import type { ScoredOption } from './decide';
import { V_keeperPass } from './keeperValue';
import { allies, danger, enemies, passEstimate, type World } from './evaluate';
import { predictShotZone } from './model';
import { softmaxPick } from './prob';
import type { DifficultyProfile } from './profile';

/**
 * Goleiro bot: acompanha a bola dentro da área, sai em bola solta na área e
 * escolhe a zona pelo histórico do chutador (quanto mais Visão, mais confia na leitura).
 */
export function keeperDecide(w: World, id: string, profile: DifficultyProfile, rng: Rng): { plan: Plan; options: ScoredOption[] } {
  const s = w.state;
  const f = s.setup.field;
  const me = s.players[id];
  const pos = w.pos[id];
  const holder = s.ball.holder;

  // com a bola: sai jogando no aliado mais seguro
  if (holder === id) {
    const opts = allies(w)
      .map((a) => {
        const est = passEstimate(w, id, pos, w.pos[a]);
        return { a, est, score: V_keeperPass(w, w.pos[a], est.p) };
      })
      .sort((x, y) => y.score - x.score);
    const underPressure = enemies(w).some((e) => cheb(w.pos[e], pos) <= 2);
    if (opts[0] && (opts[0].est.p > 0.2 || underPressure)) {
      return {
        plan: { playerId: id, dest: pos, action: 'passe_pe', targetPlayer: opts[0].a, keeperZone: 1, auto: true },
        options: opts.slice(0, 3).map((o) => ({ plan: { playerId: id, dest: pos, action: 'passe_pe', targetPlayer: o.a }, score: Math.round(o.score * 100) / 100, label: `Saída para ${o.a}` })),
      };
    }
    return { plan: { playerId: id, dest: pos, action: 'proteger', keeperZone: 1, auto: true }, options: [] };
  }

  // posicionamento: linha do gol, acompanhando a altura da bola
  const rows = goalRows(f);
  const gx = ownGoalX(me.team, f);
  const ball = s.ball.pos;
  const targetY = Math.max(rows[0], Math.min(rows[rows.length - 1], ball.y));
  let dest: Cell = { x: gx, y: targetY };
  let action: Plan['action'] = 'gk_posicionar';
  if (!holder && isInArea(ball, me.team, f) && cheb(pos, ball) <= 2) {
    dest = ball;
    action = 'gk_sair';
  }
  const reach = reachableCells(s, id);
  if (!reach.some((c) => c.x === dest.x && c.y === dest.y)) {
    dest = reach.sort((a, b) => cheb(a, dest) - cheb(b, dest))[0] ?? pos;
  }

  // zona: pelo histórico do provável chutador
  const shooter =
    holder && s.players[holder].team !== me.team
      ? holder
      : enemies(w).sort((a, b) => danger(s, w.pos[b], s.players[b].team) - danger(s, w.pos[a], s.players[a].team))[0];
  const vis = effectiveAttrs(s, id).visao;
  const zp = shooter ? predictShotZone(w.model, shooter) : { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 };
  const keys = Object.keys(zp);
  // Visão alta = confia mais na tendência; a IA também mistura para não ser explorada
  const sharp = 1 + vis * MATCH_RULES.keeperBotVisionWeight * (profile.reading === 'off' ? 0.2 : 1);
  const scores = keys.map((k) => Math.log(Math.max(1e-6, zp[k])) * sharp + (k === '1' || k === '4' ? 0.15 : 0));
  const idx = softmaxPick(keys, scores, 1, rng.next());
  const keeperZone = Number(keys[Math.max(0, idx)]) as GoalZone;
  return {
    plan: { playerId: id, dest, action, keeperZone, auto: true },
    options: [{ plan: { playerId: id, dest, action, keeperZone }, score: 0, label: `Zona ${keeperZone}` }],
  };
}
