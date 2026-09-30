import {
  ACTION_LABEL,
  GOAL_ZONE_LABEL,
  READ_GUESS_LABEL,
  findSkill,
  type ActionKind,
  type GoalZone,
  type ReadGuess,
} from '@ego/content';
import {
  actionNeeds,
  legalActions,
  passSpaceCandidates,
  reachableCells,
  skillOptions,
  validatePlan,
  type Cell,
  type MatchState,
  type Plan,
  type ReactionRequest,
} from '@ego/engine';
import { renderPlanning } from '@ego/render';
import { cid } from '../router';
import { ButtonStyle, btn, file, images, row, select, selectBlock, sep, text, type Block, type ScreenSpec } from '../ui';

/** Rascunho do plano enquanto o jogador clica no painel efêmero. */
export interface Draft {
  dest?: Cell;
  action?: ActionKind;
  targetPlayer?: string | null;
  targetCell?: Cell | null;
  shotZone?: GoalZone | null;
  keeperZone?: GoalZone | null;
  readGuess?: ReadGuess | null;
  skill?: string | null;
  skillTarget?: string | null;
  useFlow?: boolean;
  sprint?: boolean;
  step: 'main' | 'target';
  confirmed?: boolean;
  error?: string | null;
}

export function draftToPlan(slotId: string, d: Draft): Plan {
  return {
    playerId: slotId,
    dest: d.dest!,
    action: d.action!,
    targetPlayer: d.targetPlayer ?? null,
    targetCell: d.targetCell ?? null,
    shotZone: d.shotZone ?? null,
    keeperZone: d.keeperZone ?? null,
    readGuess: d.readGuess ?? null,
    skill: d.skill ?? null,
    skillTarget: d.skillTarget ?? null,
    useFlow: !!d.useFlow,
    sprint: !!d.sprint,
  };
}

export function planToDraft(p: Plan): Draft {
  return {
    dest: p.dest,
    action: p.action,
    targetPlayer: p.targetPlayer ?? null,
    targetCell: p.targetCell ?? null,
    shotZone: p.shotZone ?? null,
    keeperZone: p.keeperZone ?? null,
    readGuess: p.readGuess ?? null,
    skill: p.skill ?? null,
    skillTarget: p.skillTarget ?? null,
    useFlow: !!p.useFlow,
    sprint: !!p.sprint,
    step: 'main',
  };
}

const ZONES: GoalZone[] = [3, 4, 5, 0, 1, 2];
const GUESSES: ReadGuess[] = ['drible', 'passe', 'chute', 'proteger'];

export function nameOf(state: MatchState, id: string): string {
  return state.setup.slots.find((s) => s.id === id)?.name ?? id;
}

function relative(state: MatchState, slotId: string, c: Cell): string {
  const p = state.players[slotId];
  const dir = p.team === 'A' ? 1 : -1;
  const fwd = (c.x - p.pos.x) * dir;
  const lat = c.y - p.pos.y;
  const parts: string[] = [];
  if (fwd > 0) parts.push(`${fwd} à frente`);
  if (fwd < 0) parts.push(`${-fwd} atrás`);
  if (lat < 0) parts.push(`${-lat} acima`);
  if (lat > 0) parts.push(`${lat} abaixo`);
  return parts.length ? parts.join(', ') : 'ficar';
}

/** Casas numeradas do painel, com os modificadores escolhidos (sprint, habilidade, Flow). */
export function numberedCells(state: MatchState, slotId: string, d: Draft, lateMove = false): Cell[] {
  const cells = reachableCells(state, slotId, { sprint: d.sprint, skill: lateMove ? (d.skill ?? null) : d.skill, useFlow: d.useFlow });
  // no máximo 100 casas numeradas (4 menus de 25)
  if (cells.length <= 100) return cells;
  const p = state.players[slotId];
  return [...cells]
    .sort((a, b) => Math.max(Math.abs(a.x - p.pos.x), Math.abs(a.y - p.pos.y)) - Math.max(Math.abs(b.x - p.pos.x), Math.abs(b.y - p.pos.y)))
    .slice(0, 100)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function summary(state: MatchState, d: Draft, cells: Cell[]): string {
  const idx = d.dest ? cells.findIndex((c) => c.x === d.dest!.x && c.y === d.dest!.y) : -1;
  const parts = [`Destino: **${idx >= 0 ? idx + 1 : d.dest ? 'definido' : '—'}**`, `Ação: **${d.action ? ACTION_LABEL[d.action] : '—'}**`];
  if (d.targetPlayer) parts.push(`Alvo: **${nameOf(state, d.targetPlayer)}**`);
  if (d.targetCell) parts.push(`Casa do passe: **${d.targetCell.x + 1},${d.targetCell.y + 1}**`);
  if (d.shotZone !== null && d.shotZone !== undefined && (d.action === 'chutar' || d.action === 'finalizar_primeira')) parts.push(`Zona: **${GOAL_ZONE_LABEL[d.shotZone]}**`);
  if (d.keeperZone !== null && d.keeperZone !== undefined) parts.push(`Cobre: **${GOAL_ZONE_LABEL[d.keeperZone]}**`);
  if (d.readGuess) parts.push(`Leitura: **${READ_GUESS_LABEL[d.readGuess]}**`);
  const mods = [d.sprint ? 'Sprint' : null, d.skill ? findSkill(d.skill)?.name : null, d.useFlow ? 'Flow' : null].filter(Boolean);
  if (mods.length) parts.push(`Extra: **${mods.join(' + ')}**`);
  return parts.join(' · ');
}

/** O que falta para confirmar. */
export function missing(state: MatchState, slotId: string, d: Draft): string | null {
  if (!d.dest) return 'Escolha o destino.';
  if (!d.action) return 'Escolha a ação.';
  const need = actionNeeds(d.action);
  if ((need === 'ally' || need === 'enemy') && !d.targetPlayer) return 'Escolha o alvo.';
  if (need === 'cell' && !d.targetCell) return 'Escolha a casa do passe.';
  if (need === 'zone' && (d.shotZone === null || d.shotZone === undefined)) return 'Escolha a zona do chute.';
  if (need === 'guess' && !d.readGuess) return 'Escolha o que ler.';
  void state;
  void slotId;
  return null;
}

export interface PanelContext {
  matchId: string;
  state: MatchState;
  slotId: string;
  draft: Draft;
  /** 'plan' = planejamento; 'react' = janela de reação. */
  mode: 'plan' | 'react';
  reaction?: ReactionRequest;
  deadline: number;
}

export function panelScreen(ctx: PanelContext): ScreenSpec {
  const { state, slotId, draft: d, matchId, mode } = ctx;
  const p = state.players[slotId];
  const slot = state.setup.slots.find((s) => s.id === slotId)!;
  const R = ctx.reaction;
  const P = mode === 'plan' ? 'pl' : 'rx';
  const allowDest = mode === 'plan' || !!R?.allowDest;
  const allowAction = mode === 'plan' || !!R?.allowAction;
  const cells = numberedCells(state, slotId, d, !!R?.lateMove);
  const holder = state.ball.holder;
  const situation = p.isKeeper ? (holder === slotId ? 'goleiro com a bola' : 'goleiro') : holder === slotId ? 'com a bola' : !holder ? 'bola solta' : state.players[holder].team === p.team ? 'ataque sem bola' : 'defesa';
  const blocks: Block[] = [];
  const files = [];

  if (d.confirmed) {
    return {
      accent: 'sucesso',
      blocks: [
        text(`### Plano confirmado\n${summary(state, d, cells)}`),
        text(mode === 'plan' ? `-# Pode refazer até o fim do planejamento (<t:${Math.floor(ctx.deadline / 1000)}:R>).` : '-# Reação registrada.'),
        mode === 'plan' ? row(btn(cid(P, 'redo', matchId), 'Refazer plano', ButtonStyle.Secondary)) : text(''),
      ],
    };
  }

  const head =
    mode === 'plan'
      ? `### Lance ${state.turnInHalf} · ${slot.name}\n${situation} · Fôlego **${p.stamina}** · Flow **${p.flow}/100** · fecha <t:${Math.floor(ctx.deadline / 1000)}:R>`
      : `### Janela de reação · ${findSkill(R!.skillId)?.name ?? ''}\n${
          R!.revealed.length
            ? R!.revealed.map((r) => `${nameOf(state, r.playerId)}: ${r.action ? `**${ACTION_LABEL[r.action]}**` : ''}${r.dest ? ` → casa ${r.dest.x + 1},${r.dest.y + 1}` : ''}`).join('\n')
            : 'Nada revelado.'
        }\n-# Fecha <t:${Math.floor(ctx.deadline / 1000)}:R>. ${R!.allowDest && R!.allowAction ? 'Pode trocar destino e ação.' : R!.allowDest ? 'Pode trocar o destino.' : 'Pode trocar a ação.'}`;
  blocks.push(text(head));
  blocks.push(text(summary(state, d, cells) + (d.error ? `\n**${d.error}**` : '')));

  // passo "alvo"
  if (d.step === 'target' && d.action) {
    const need = actionNeeds(d.action);
    if (need === 'cell') {
      const cand = passSpaceCandidates(state, slotId);
      files.push(file(renderPlanning(state, slotId, cand, { fullField: true, cell: 48 }), 'alvo.png'));
      blocks.push(images('alvo.png'));
      blocks.push(selectBlock(select(cid(P, 'cell', matchId), 'Casa do passe', cand.map((c, i) => ({ label: `Casa ${i + 1}`, value: `${c.x},${c.y}`, description: relative(state, slotId, c) })))));
    } else if (need === 'ally' || need === 'enemy') {
      const opts = state.order.filter((id) => {
        const o = state.players[id];
        if (id === slotId) return false;
        if (need === 'ally') return o.team === p.team;
        return o.team !== p.team && !o.isKeeper;
      });
      for (let k = 0; k < opts.length && k < 10; k += 5)
        blocks.push(row(...opts.slice(k, k + 5).map((id) => btn(cid(P, 'tgt', matchId, id), `${nameOf(state, id)} (${state.setup.slots.find((s) => s.id === id)!.number})`, d.targetPlayer === id ? ButtonStyle.Primary : ButtonStyle.Secondary))));
    } else if (need === 'zone') {
      blocks.push(row(...ZONES.slice(0, 3).map((z) => btn(cid(P, 'zone', matchId, z), GOAL_ZONE_LABEL[z], d.shotZone === z ? ButtonStyle.Primary : ButtonStyle.Secondary))));
      blocks.push(row(...ZONES.slice(3).map((z) => btn(cid(P, 'zone', matchId, z), GOAL_ZONE_LABEL[z], d.shotZone === z ? ButtonStyle.Primary : ButtonStyle.Secondary))));
    } else if (need === 'guess') {
      blocks.push(row(...GUESSES.map((g) => btn(cid(P, 'guess', matchId, g), READ_GUESS_LABEL[g], d.readGuess === g ? ButtonStyle.Primary : ButtonStyle.Secondary))));
    }
    const miss = missing(state, slotId, d);
    blocks.push(row(btn(cid(P, 'back', matchId), 'Voltar'), btn(cid(P, 'ok', matchId), 'Confirmar', ButtonStyle.Success, !!miss)));
    return { accent: 'padrao', blocks, files };
  }

  // passo principal
  if (allowDest) {
    files.push(file(renderPlanning(state, slotId, cells), 'painel.png'));
    blocks.push(images('painel.png'));
    for (let k = 0; k < cells.length; k += 25) {
      const chunk = cells.slice(k, k + 25);
      blocks.push(
        selectBlock(
          select(
            cid(P, 'dest', matchId, k / 25),
            cells.length > 25 ? `Destino (casas ${k + 1} a ${k + chunk.length})` : 'Destino',
            chunk.map((c, i) => ({ label: `Casa ${k + i + 1}`, value: `${c.x},${c.y}`, description: relative(state, slotId, c), default: !!d.dest && d.dest.x === c.x && d.dest.y === c.y })),
          ),
        ),
      );
    }
  }
  if (allowAction) {
    const actions = legalActions(state, slotId);
    for (let k = 0; k < actions.length; k += 5)
      blocks.push(row(...actions.slice(k, k + 5).map((a) => btn(cid(P, 'act', matchId, a), ACTION_LABEL[a], d.action === a ? ButtonStyle.Primary : ButtonStyle.Secondary))));
  }
  if (mode === 'plan') {
    if (p.isKeeper) {
      // o goleiro escolhe a zona que cobre em todo lance
      blocks.push(row(...ZONES.slice(0, 3).map((z) => btn(cid(P, 'kz', matchId, z), GOAL_ZONE_LABEL[z], d.keeperZone === z ? ButtonStyle.Primary : ButtonStyle.Secondary))));
      blocks.push(row(...ZONES.slice(3).map((z) => btn(cid(P, 'kz', matchId, z), GOAL_ZONE_LABEL[z], d.keeperZone === z ? ButtonStyle.Primary : ButtonStyle.Secondary))));
    } else {
      const mods = [btn(cid(P, 'sprint', matchId), d.sprint ? 'Sprint: sim' : 'Sprint', d.sprint ? ButtonStyle.Primary : ButtonStyle.Secondary, p.stamina < 15)];
      for (const o of skillOptions(state, slotId, d.action).slice(0, 4)) {
        const active = o.kind === 'flow' ? !!d.useFlow : d.skill === o.skillId;
        const label = o.usable || active ? `${o.name}${o.kind === 'flow' ? ' (Flow)' : ` · ${o.stamina}`}` : `${o.name} · ${o.reason}`;
        mods.push(btn(cid(P, o.kind === 'flow' ? 'flow' : 'skill', matchId, o.skillId), label, active ? ButtonStyle.Primary : ButtonStyle.Secondary, !o.usable && !active));
      }
      blocks.push(row(...mods.slice(0, 5)));
    }
  }
  const miss = missing(state, slotId, d);
  const needTarget = d.action && actionNeeds(d.action) !== 'none';
  blocks.push(
    row(
      needTarget ? btn(cid(P, 'next', matchId), 'Escolher alvo', ButtonStyle.Primary, !d.action) : btn(cid(P, 'ok', matchId), 'Confirmar', ButtonStyle.Success, !!miss),
      btn(cid(P, 'clear', matchId), 'Limpar'),
    ),
  );
  if (blocks.length && mode === 'plan') blocks.splice(2, 0, sep(false, false));
  return { accent: 'padrao', blocks, files };
}

/** Aplica um clique no rascunho. Retorna true se deve confirmar. */
export function applyClick(state: MatchState, slotId: string, d: Draft, action: string, arg: string | undefined, values: string[] | null): 'confirm' | 'update' {
  d.error = null;
  switch (action) {
    case 'dest': {
      const [x, y] = (values?.[0] ?? '').split(',').map(Number);
      d.dest = { x, y };
      break;
    }
    case 'act': {
      const a = arg as ActionKind;
      d.action = a;
      if (a === 'proteger') d.dest = { ...state.players[slotId].pos };
      if (!d.dest && (a === 'passe_pe' || a === 'passe_espaco' || a === 'chutar' || a === 'marcar' || a === 'corta_luz')) d.dest = { ...state.players[slotId].pos };
      if (actionNeeds(a) === 'zone' && (d.shotZone === null || d.shotZone === undefined)) d.shotZone = null;
      if (d.skill) {
        const opt = skillOptions(state, slotId, a).find((o) => o.skillId === d.skill);
        if (!opt?.usable) d.skill = null;
      }
      break;
    }
    case 'next':
      d.step = 'target';
      break;
    case 'back':
      d.step = 'main';
      break;
    case 'tgt':
      d.targetPlayer = arg ?? null;
      break;
    case 'cell': {
      const [x, y] = (values?.[0] ?? '').split(',').map(Number);
      d.targetCell = { x, y };
      break;
    }
    case 'zone':
      d.shotZone = Number(arg) as GoalZone;
      break;
    case 'kz':
      d.keeperZone = Number(arg) as GoalZone;
      break;
    case 'guess':
      d.readGuess = arg as ReadGuess;
      break;
    case 'sprint':
      d.sprint = !d.sprint;
      d.dest = undefined;
      break;
    case 'skill':
      d.skill = d.skill === arg ? null : (arg ?? null);
      d.dest = undefined;
      break;
    case 'flow':
      d.useFlow = !d.useFlow;
      d.dest = undefined;
      break;
    case 'clear':
      Object.assign(d, { dest: undefined, action: undefined, targetPlayer: null, targetCell: null, shotZone: null, readGuess: null, skill: null, useFlow: false, sprint: false, step: 'main' });
      break;
    case 'ok': {
      const miss = missing(state, slotId, d);
      if (miss) {
        d.error = miss;
        break;
      }
      if (state.players[slotId].isKeeper && (d.keeperZone === null || d.keeperZone === undefined)) d.keeperZone = 1;
      const chk = validatePlan(state, draftToPlan(slotId, d));
      if (!chk.ok) {
        d.error = chk.error ?? 'Plano inválido.';
        d.step = 'main';
        break;
      }
      return 'confirm';
    }
    case 'redo':
      d.confirmed = false;
      break;
  }
  return 'update';
}
