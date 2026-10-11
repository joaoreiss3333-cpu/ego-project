import {
  ACTION_HELP,
  ACTION_LABEL,
  GOAL_ZONE_LABEL,
  MATCH_RULES,
  READ_GUESS_LABEL,
  findSkill,
  type ActionKind,
  type GoalZone,
  type ReadGuess,
} from '@ego/content';
import {
  actionNeeds,
  attackingGoalX,
  cheb,
  goalCenter,
  isBallAction,
  legalActions,
  ownGoalX,
  passSpaceCandidates,
  reachableCells,
  skillFor,
  skillOptions,
  validatePlan,
  type Cell,
  type MatchState,
  type Plan,
  type ReactionRequest,
} from '@ego/engine';
import { renderPlanView } from '@ego/render';
import { cid } from '../router';
import { ButtonStyle, btn, file, images, row, select, selectBlock, sep, text, type Block, type ScreenSpec } from '../ui';

/**
 * Painel de planejamento em etapas:
 *   1. Ação (menu com a explicação de cada uma)
 *   2. Destino (setas que movem o destino no campo + atalhos prontos; sprint e habilidades aqui)
 *   3. Alvo, quando a ação pede (aliado, casa do passe, canto do chute, palpite da Leitura, canto do goleiro)
 * O resumo do plano fica sempre visível e "Confirmar" aparece na última etapa.
 */
export type PanelStep = 'action' | 'dest' | 'target';

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
  step: PanelStep;
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
    step: 'action',
  };
}

/** Rascunho vazio de um jogador (o goleiro já começa cobrindo o centro baixo). */
export function newDraft(state: MatchState, slotId: string): Draft {
  return { step: 'action', keeperZone: state.players[slotId].isKeeper ? 1 : null };
}

/** Canto do gol na ordem em que aparece nos botões: de cima para baixo, da esquerda para a direita. */
const ZONES: GoalZone[] = [3, 4, 5, 0, 1, 2];
const GUESSES: ReadGuess[] = ['drible', 'passe', 'chute', 'proteger'];
const GUESS_HELP: Record<ReadGuess, string> = {
  drible: 'ele vai driblar ou conduzir',
  passe: 'ele vai passar (inclui tabela)',
  chute: 'ele vai chutar',
  proteger: 'ele vai ficar parado protegendo',
};

/** Setas do direcional: [rótulo, dx, dy]. dy negativo é para cima na imagem. */
const PAD: [string, number, number][][] = [
  [
    ['↖', -1, -1],
    ['↑', 0, -1],
    ['↗', 1, -1],
  ],
  [
    ['←', -1, 0],
    ['', 0, 0],
    ['→', 1, 0],
  ],
  [
    ['↙', -1, 1],
    ['↓', 0, 1],
    ['↘', 1, 1],
  ],
];

export function nameOf(state: MatchState, id: string): string {
  return state.setup.slots.find((s) => s.id === id)?.name ?? id;
}

const same = (a: Cell | undefined | null, b: Cell | undefined | null) => !!a && !!b && a.x === b.x && a.y === b.y;
const parseCell = (v: string | undefined): Cell | null => {
  const [x, y] = (v ?? '').split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/** Posição de `c` em relação a `from`, com "frente" no sentido de ataque do time. */
export function relativeFrom(team: 'A' | 'B', from: Cell, c: Cell): string {
  const dir = team === 'A' ? 1 : -1;
  const fwd = (c.x - from.x) * dir;
  const lat = c.y - from.y;
  const parts: string[] = [];
  if (fwd > 0) parts.push(`${fwd} à frente`);
  if (fwd < 0) parts.push(`${-fwd} atrás`);
  if (lat < 0) parts.push(`${-lat} acima`);
  if (lat > 0) parts.push(`${lat} abaixo`);
  return parts.join(', ');
}

function relative(state: MatchState, slotId: string, c: Cell): string {
  const p = state.players[slotId];
  return relativeFrom(p.team, p.pos, c) || 'ficar onde está';
}

/** Casas alcançáveis com os extras escolhidos (sprint, habilidade, Flow). */
export function reachFor(state: MatchState, slotId: string, d: Draft): Cell[] {
  return reachableCells(state, slotId, { sprint: d.sprint, skill: d.skill, useFlow: d.useFlow });
}

// ---------------------------------------------------------------------------
// Situação e textos
// ---------------------------------------------------------------------------

export type Situation = 'carrier' | 'attack' | 'defense' | 'loose' | 'keeper' | 'keeper_ball';

export function situationOf(state: MatchState, slotId: string): Situation {
  const p = state.players[slotId];
  const holder = state.ball.holder;
  if (p.isKeeper) return holder === slotId ? 'keeper_ball' : 'keeper';
  if (holder === slotId) return 'carrier';
  if (!holder) return 'loose';
  return state.players[holder].team === p.team ? 'attack' : 'defense';
}

const SITUATION_TEXT: Record<Situation, { title: string; hint: string }> = {
  carrier: { title: 'Você está **com a bola**.', hint: 'Avance com ela (Conduzir ou Driblar), passe para um companheiro ou chute se estiver perto do gol.' },
  attack: { title: 'Seu time **está com a bola**.', hint: 'Sem bola você abre espaço: corra para uma casa livre, peça a bola ou prepare um chute de primeira.' },
  defense: { title: 'O adversário **está com a bola**.', hint: 'Pressione o portador (Bote ou Conter), feche a linha de passe ou marque alguém.' },
  loose: { title: 'A bola **está solta**.', hint: 'Quem pisar primeiro na casa da bola fica com ela. Corra para ela ou marque quem está perto.' },
  keeper: { title: 'Você é **o goleiro**.', hint: 'Fique na área e escolha o canto do gol que vai cobrir. Acertar o canto do chute vale muito.' },
  keeper_ball: { title: 'Você é o goleiro **com a bola**.', hint: 'Recomece o jogo: passe para um companheiro livre.' },
};

function destQuestion(state: MatchState, slotId: string, d: Draft): string {
  const a = d.action;
  if (state.players[slotId].isKeeper && a && !isBallAction(a)) return 'Para onde o goleiro vai? (só dentro da área)';
  switch (a) {
    case 'conduzir':
      return 'Para onde você leva a bola? Conduzindo, você para na borda da zona de um adversário.';
    case 'driblar':
      return 'Para onde você dribla? Cada zona de adversário que você cruzar vira um duelo.';
    case 'passe_pe':
    case 'passe_espaco':
    case 'tabela':
      return 'Quer andar antes de passar? A bola sai da casa onde você parar. Se não, deixe no lugar.';
    case 'chutar':
      return 'Quer andar antes de chutar? Mais perto do gol é melhor. Se não, deixe no lugar.';
    case 'finalizar_primeira':
      return 'Onde você quer receber a bola para chutar de primeira?';
    case 'marcar':
      return 'Para onde você corre? Marcando, você acompanha o alvo até o destino dele.';
    default:
      return 'Para onde você corre?';
  }
}

function targetQuestion(state: MatchState, slotId: string, d: Draft): string {
  const a = d.action!;
  if (state.players[slotId].isKeeper && !isBallAction(a)) {
    return a === 'gk_comandar' ? 'Qual companheiro recebe +1 de Defesa? E qual canto do gol você cobre?' : 'Qual canto do gol você cobre? Se o chute vier nesse canto, a defesa fica muito mais fácil.';
  }
  switch (actionNeeds(a)) {
    case 'ally':
      return a === 'tabela' ? 'Com quem você faz a tabela? Ele também precisa escolher Tabela.' : 'Para quem você passa? A bola chega onde ele terminar o movimento.';
    case 'enemy':
      return a === 'corta_luz' ? 'Qual adversário (colado em você) perde 1 casa de movimento?' : 'Quem você marca?';
    case 'cell':
      return 'Em qual casa a bola cai? Um companheiro nela ou ao lado recebe com +2.';
    case 'zone':
      return 'Em qual canto do gol você chuta? O goleiro também escolhe um canto: se acertar o seu, fica difícil.';
    case 'guess':
      return `O que o portador vai fazer? Acertou: +${MATCH_RULES.duel.readBonus} nos duelos e Flow. Errou: -${MATCH_RULES.duel.readWrongInitiativePenalty} de iniciativa no próximo lance.`;
    default:
      return '';
  }
}

/** A ação precisa da etapa "alvo"? (goleiro sem bola sempre escolhe o canto que cobre) */
export function needsTarget(state: MatchState, slotId: string, action: ActionKind | undefined): boolean {
  if (!action) return false;
  if (state.players[slotId].isKeeper && !isBallAction(action)) return true;
  return actionNeeds(action) !== 'none';
}

/** Plano em linhas curtas, para o resumo e a confirmação. */
export function describePlan(state: MatchState, slotId: string, d: Draft): string[] {
  const lines: string[] = [];
  const a = d.action;
  let act = a ? `**${ACTION_LABEL[a]}**` : '—';
  if (a) {
    const need = actionNeeds(a);
    if ((need === 'ally' || need === 'enemy') && d.targetPlayer) act += ` · ${a === 'marcar' || a === 'corta_luz' ? 'em' : 'para'} **${nameOf(state, d.targetPlayer)}**`;
    if (need === 'cell' && d.targetCell) act += ` · na casa marcada`;
    if (need === 'zone' && d.shotZone !== null && d.shotZone !== undefined) act += ` · canto **${GOAL_ZONE_LABEL[d.shotZone]}**`;
    if (need === 'guess' && d.readGuess) act += ` · palpite **${READ_GUESS_LABEL[d.readGuess]}**`;
    if (state.players[slotId].isKeeper && !isBallAction(a) && d.keeperZone !== null && d.keeperZone !== undefined) act += ` · cobre **${GOAL_ZONE_LABEL[d.keeperZone]}**`;
  }
  lines.push(`Ação: ${act}`);
  lines.push(`Destino: **${d.dest ? relative(state, slotId, d.dest) : '—'}**`);
  const mods = [d.sprint ? 'Sprint' : null, d.skill ? findSkill(d.skill)?.name : null, d.useFlow ? `Flow (${findSkill(state.setup.slots.find((s) => s.id === slotId)?.loadout.flow)?.name ?? 'Flow'})` : null].filter(Boolean);
  if (mods.length) lines.push(`Extras: **${mods.join(' + ')}**`);
  return lines;
}

/** O que falta para confirmar. */
export function missing(state: MatchState, slotId: string, d: Draft): string | null {
  if (!d.action) return 'Escolha a ação.';
  if (!d.dest) return 'Escolha o destino.';
  const need = actionNeeds(d.action);
  if ((need === 'ally' || need === 'enemy') && !d.targetPlayer) return need === 'ally' ? 'Escolha o companheiro.' : 'Escolha o adversário.';
  if (need === 'cell' && !d.targetCell) return 'Escolha a casa do passe.';
  if (need === 'zone' && (d.shotZone === null || d.shotZone === undefined)) return 'Escolha o canto do chute.';
  if (need === 'guess' && !d.readGuess) return 'Escolha o palpite.';
  void state;
  void slotId;
  return null;
}

// ---------------------------------------------------------------------------
// Atalhos de destino
// ---------------------------------------------------------------------------

export interface Shortcut {
  label: string;
  cell: Cell;
}

/** Casa alcançável mais perto de um ponto (desempate: mais perto de onde o jogador está). */
function nearestTo(cells: Cell[], target: Cell, from: Cell, exclude: (c: Cell) => boolean = () => false): Cell | null {
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (const c of cells) {
    if (exclude(c)) continue;
    const score = cheb(c, target) * 100 + Math.hypot(c.x - target.x, c.y - target.y) * 10 + cheb(c, from);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Casa com mais espaço (longe dos adversários), puxando para o ataque. */
function openSpace(state: MatchState, slotId: string, cells: Cell[]): Cell | null {
  const p = state.players[slotId];
  const dir = p.team === 'A' ? 1 : -1;
  const enemies = state.order.map((id) => state.players[id]).filter((o) => o.team !== p.team && !o.isKeeper);
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (const c of cells) {
    if (same(c, p.pos)) continue;
    const space = enemies.length ? Math.min(...enemies.map((e) => cheb(e.pos, c))) : 5;
    const score = Math.min(space, 4) * 10 + (c.x - p.pos.x) * dir * 3 - Math.abs(c.y - state.setup.field.height / 2);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Destinos prontos com nome ("Rumo ao gol", "Pressionar o portador"...), calculados da situação. */
export function destShortcuts(state: MatchState, slotId: string, cells: Cell[]): Shortcut[] {
  const p = state.players[slotId];
  const f = state.setup.field;
  const holder = state.ball.holder;
  const out: Shortcut[] = [];
  const add = (label: string, c: Cell | null) => {
    if (!c || same(c, p.pos) || out.some((o) => same(o.cell, c))) return;
    out.push({ label, cell: c });
  };
  const occupied = (c: Cell) => state.order.some((id) => id !== slotId && same(state.players[id].pos, c));
  const attackGoal = goalCenter(attackingGoalX(p.team, f), f);
  const myGoal = goalCenter(ownGoalX(p.team, f), f);
  const sit = situationOf(state, slotId);
  if (sit === 'keeper' || sit === 'keeper_ball') {
    add('Centro do gol', nearestTo(cells, myGoal, p.pos));
    add('Lado da bola', nearestTo(cells, { x: myGoal.x, y: state.ball.pos.y }, p.pos));
    return out;
  }
  if (sit === 'carrier') {
    add('Rumo ao gol', nearestTo(cells, attackGoal, p.pos, occupied));
    add('Espaço livre à frente', openSpace(state, slotId, cells.filter((c) => !occupied(c))));
    add('Pela ponta de cima', nearestTo(cells, { x: attackGoal.x, y: 0 }, p.pos, occupied));
    add('Pela ponta de baixo', nearestTo(cells, { x: attackGoal.x, y: f.height - 1 }, p.pos, occupied));
  } else if (sit === 'attack' && holder) {
    add('Avançar para a área', nearestTo(cells, attackGoal, p.pos, occupied));
    add('Espaço livre (linha de passe)', openSpace(state, slotId, cells.filter((c) => !occupied(c))));
    add(`Aproximar de ${nameOf(state, holder)}`, nearestTo(cells, state.players[holder].pos, p.pos, (c) => occupied(c) || same(c, state.players[holder].pos)));
  } else if (sit === 'defense' && holder) {
    const h = state.players[holder];
    add(`Pressionar ${nameOf(state, holder)}`, nearestTo(cells, h.pos, p.pos, (c) => occupied(c) || same(c, h.pos)));
    const mid = { x: Math.round((h.pos.x + myGoal.x) / 2), y: Math.round((h.pos.y + myGoal.y) / 2) };
    add('Fechar o caminho do gol', nearestTo(cells, mid, p.pos, occupied));
    for (const id of state.order) {
      const o = state.players[id];
      if (o.team === p.team || o.isKeeper || id === holder) continue;
      add(`Colar em ${nameOf(state, id)}`, nearestTo(cells, o.pos, p.pos, (c) => occupied(c) || same(c, o.pos)));
      if (out.length >= 5) break;
    }
  } else if (sit === 'loose') {
    add('Ir na bola', nearestTo(cells, state.ball.pos, p.pos));
    add('Avançar para a área', nearestTo(cells, attackGoal, p.pos, occupied));
    add('Voltar para defender', nearestTo(cells, { x: Math.round((myGoal.x + p.pos.x) / 2), y: myGoal.y }, p.pos, occupied));
  }
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

export interface PanelContext {
  matchId: string;
  state: MatchState;
  slotId: string;
  draft: Draft;
  /** 'plan' = planejamento; 'react' = janela de reação. */
  mode: 'plan' | 'react';
  reaction?: ReactionRequest;
  /** Fim do planejamento (ms). 0 = sem relógio (tutorial). */
  deadline: number;
  /** Prefixo dos custom_id (padrão: 'pl' no planejamento, 'rx' na reação). */
  prefix?: string;
  /** Blocos no topo do painel (instrução do tutorial). */
  intro?: Block[];
  /** Casa objetivo desenhada no campo (tutorial). */
  mark?: Cell | null;
  /** Rótulo do botão de confirmar. */
  confirmLabel?: string;
}

interface Flags {
  allowDest: boolean;
  allowAction: boolean;
}

function flagsOf(ctx: Pick<PanelContext, 'mode' | 'reaction'>): Flags {
  return {
    allowDest: ctx.mode === 'plan' || !!ctx.reaction?.allowDest,
    allowAction: ctx.mode === 'plan' || !!ctx.reaction?.allowAction,
  };
}

/** Etapas visíveis para este rascunho. */
export function stepsOf(state: MatchState, slotId: string, d: Draft, flags: Flags): PanelStep[] {
  const s: PanelStep[] = [];
  if (flags.allowAction) s.push('action');
  if (flags.allowDest) s.push('dest');
  if (flags.allowAction && needsTarget(state, slotId, d.action)) s.push('target');
  return s;
}

const STEP_LABEL: Record<PanelStep, string> = { action: 'Ação', dest: 'Destino', target: 'Alvo' };

function actionsFor(state: MatchState, slotId: string, R?: ReactionRequest): ActionKind[] {
  const all = legalActions(state, slotId);
  return R?.ballActionOnly ? all.filter(isBallAction) : all;
}

function skillHelp(state: MatchState, slotId: string, skillId: string): string {
  const r = skillFor(state, slotId, skillId);
  return r.def.describe(r.params, { stamina: r.stamina, cooldown: r.cooldown });
}

export function panelScreen(ctx: PanelContext): ScreenSpec {
  const { state, slotId, draft: d, matchId, mode } = ctx;
  const p = state.players[slotId];
  const slot = state.setup.slots.find((s) => s.id === slotId)!;
  const R = ctx.reaction;
  const P = ctx.prefix ?? (mode === 'plan' ? 'pl' : 'rx');
  const flags = flagsOf(ctx);
  const clock = ctx.deadline ? ` · fecha <t:${Math.floor(ctx.deadline / 1000)}:R>` : '';

  if (d.confirmed) {
    return {
      accent: 'sucesso',
      blocks: [
        text(`### Plano confirmado\n${describePlan(state, slotId, d).join('\n')}`),
        text(mode === 'plan' ? `-# Esperando os outros jogadores. Você pode refazer até o fim do planejamento${clock}.` : '-# Reação registrada. O lance resolve quando a janela fechar.'),
        ...(mode === 'plan' ? [row(btn(cid(P, 'redo', matchId), 'Refazer plano', ButtonStyle.Secondary))] : []),
      ],
    };
  }

  const steps = stepsOf(state, slotId, d, flags);
  if (!steps.includes(d.step)) d.step = steps[0] ?? 'dest';
  const idx = steps.indexOf(d.step);
  const blocks: Block[] = [...(ctx.intro ?? [])];
  const files = [];

  // cabeçalho
  const sit = SITUATION_TEXT[situationOf(state, slotId)];
  const head =
    mode === 'plan'
      ? `### Lance ${state.turnInHalf} · ${slot.name} #${slot.number}\n${sit.title} Fôlego **${p.stamina}** · Flow **${p.flow}/100**${clock}`
      : `### Reação · ${findSkill(R!.skillId)?.name ?? ''}\n${
          R!.revealed.length
            ? R!.revealed.map((r) => `${nameOf(state, r.playerId)}: ${r.action ? `**${ACTION_LABEL[r.action]}**` : ''}${r.dest ? ` indo ${relativeFrom(p.team, state.players[r.playerId].pos, r.dest) || 'ficar'}` : ''}`).join('\n')
            : 'A habilidade não revelou nada novo.'
        }\n-# ${R!.allowDest && R!.allowAction ? 'Você pode trocar destino e ação.' : R!.allowDest ? 'Você pode trocar o destino.' : 'Você pode trocar a ação.'}${clock}`;
  const stepper = `-# Etapa ${idx + 1} de ${steps.length} · ${steps.map((s) => (s === d.step ? `**${STEP_LABEL[s]}**` : STEP_LABEL[s])).join(' › ')}`;
  blocks.push(text(`${head}\n${stepper}${d.error ? `\n**Atenção:** ${d.error}` : ''}`));

  // imagem do campo do ponto de vista do jogador
  const reach = d.step === 'dest' && d.action !== 'proteger' ? reachFor(state, slotId, d) : undefined;
  const need = d.action ? actionNeeds(d.action) : 'none';
  const passTo = need === 'ally' && d.targetPlayer && d.action !== 'gk_comandar' ? state.players[d.targetPlayer].pos : need === 'cell' ? (d.targetCell ?? null) : null;
  const candidates = d.step === 'target' && need === 'cell' ? passSpaceCandidates(state, slotId, 12) : undefined;
  files.push(
    file(
      renderPlanView(state, slotId, {
        reach,
        dest: d.dest ?? null,
        pass: passTo,
        shot: d.action === 'chutar' && d.step !== 'action',
        numbered: candidates,
        mark: ctx.mark ?? null,
      }),
      'painel.png',
    ),
  );
  blocks.push(images('painel.png'));

  const miss = missing(state, slotId, d);
  const last = idx === steps.length - 1;
  const nav: ReturnType<typeof btn>[] = [];
  if (idx > 0) nav.push(btn(cid(P, 'go', matchId, steps[idx - 1]), `‹ ${STEP_LABEL[steps[idx - 1]]}`));

  if (d.step === 'action') {
    const actions = actionsFor(state, slotId, R);
    blocks.push(text(`**O que você quer fazer?**\n-# ${sit.hint}`));
    blocks.push(
      selectBlock(
        select(
          cid(P, 'act', matchId),
          d.action ? `Ação: ${ACTION_LABEL[d.action]}` : 'Escolha sua ação',
          actions.map((a) => ({ label: ACTION_LABEL[a], value: a, description: ACTION_HELP[a], default: d.action === a })),
        ),
      ),
    );
    if (d.action) nav.push(last ? btn(cid(P, 'ok', matchId), ctx.confirmLabel ?? 'Confirmar plano', ButtonStyle.Success, !!miss) : btn(cid(P, 'go', matchId, steps[idx + 1]), `${STEP_LABEL[steps[idx + 1]]} ›`, ButtonStyle.Primary));
  } else if (d.step === 'dest') {
    const cells = reach ?? [];
    const cur = d.dest ?? p.pos;
    if (d.action === 'proteger') {
      blocks.push(text('**Proteger:** você fica parado segurando a bola, com +2 nos duelos contra quem tentar tomar.'));
    } else {
      const rel = relative(state, slotId, cur);
      blocks.push(text(`**${destQuestion(state, slotId, d)}**\nDestino: **${rel}** · alcance **${cells.length ? Math.max(...cells.map((c) => cheb(c, p.pos))) : 0}** casa(s)\n-# Use as setas para mover o destino no campo, ou escolha um atalho.`));
      const has = (c: Cell) => cells.some((x) => same(x, c));
      for (const line of PAD) {
        blocks.push(
          row(
            ...line.map(([label, dx, dy]) => {
              if (!dx && !dy) return btn(cid(P, 'stay', matchId), same(cur, p.pos) ? 'Aqui' : 'Ficar', ButtonStyle.Secondary, same(cur, p.pos));
              return btn(cid(P, 'mv', matchId, `${dx},${dy}`), label, ButtonStyle.Primary, !has({ x: cur.x + dx, y: cur.y + dy }));
            }),
          ),
        );
      }
      const sc = destShortcuts(state, slotId, cells);
      if (sc.length)
        blocks.push(selectBlock(select(cid(P, 'sc', matchId), 'Atalhos: escolha um destino pronto', sc.map((s) => ({ label: s.label, value: `${s.cell.x},${s.cell.y}`, description: relative(state, slotId, s.cell), default: same(d.dest, s.cell) })))));
    }
    // extras: sprint, habilidades e Flow (só no planejamento, só jogador de linha)
    if (mode === 'plan' && !p.isKeeper) {
      const mods = [btn(cid(P, 'sprint', matchId), `Sprint +${MATCH_RULES.movement.sprintBonus} casas · ${MATCH_RULES.stamina.sprintCost}`, d.sprint ? ButtonStyle.Success : ButtonStyle.Secondary, p.stamina < MATCH_RULES.stamina.sprintCost && !d.sprint)];
      for (const o of skillOptions(state, slotId, d.action).slice(0, 4)) {
        const active = o.kind === 'flow' ? !!d.useFlow : d.skill === o.skillId;
        const label = o.usable || active ? `${o.name}${o.kind === 'flow' ? ' · Flow' : ` · ${o.stamina}`}` : `${o.name} · ${o.reason}`;
        mods.push(btn(cid(P, o.kind === 'flow' ? 'flow' : 'skill', matchId, o.skillId), label, active ? ButtonStyle.Success : ButtonStyle.Secondary, !o.usable && !active));
      }
      const help: string[] = [`-# **Extras** (opcional). O número é o custo de fôlego. Sprint dá +${MATCH_RULES.movement.sprintBonus} casas de alcance.`];
      if (d.skill) help.push(`-# **${findSkill(d.skill)?.name}:** ${skillHelp(state, slotId, d.skill)}`);
      if (d.useFlow && slot.loadout.flow) help.push(`-# **${findSkill(slot.loadout.flow)?.name}:** ${skillHelp(state, slotId, slot.loadout.flow)}`);
      blocks.push(sep(false, true));
      blocks.push(text(help.join('\n')));
      blocks.push(row(...mods.slice(0, 5)));
    }
    nav.push(last ? btn(cid(P, 'ok', matchId), ctx.confirmLabel ?? 'Confirmar plano', ButtonStyle.Success, !!miss) : btn(cid(P, 'go', matchId, steps[idx + 1]), `${STEP_LABEL[steps[idx + 1]]} ›`, ButtonStyle.Primary, !d.dest));
  } else {
    // alvo
    blocks.push(text(`**${targetQuestion(state, slotId, d)}**`));
    const a = d.action!;
    const isGk = p.isKeeper && !isBallAction(a);
    if (need === 'ally' || need === 'enemy') {
      const opts = state.order.filter((id) => {
        const o = state.players[id];
        if (id === slotId) return false;
        if (need === 'ally') return o.team === p.team;
        return o.team !== p.team && !o.isKeeper;
      });
      for (let k = 0; k < opts.length && k < 10; k += 5)
        blocks.push(
          row(
            ...opts.slice(k, k + 5).map((id) => {
              const o = state.players[id];
              const where = relativeFrom(p.team, p.pos, o.pos);
              return btn(cid(P, 'tgt', matchId, id), `${nameOf(state, id)}${where ? ` (${where})` : ''}`, d.targetPlayer === id ? ButtonStyle.Success : ButtonStyle.Secondary);
            }),
          ),
        );
    } else if (need === 'cell') {
      const cand = candidates ?? [];
      const allies = state.order.map((id) => state.players[id]).filter((o) => o.team === p.team && o.id !== slotId && !o.isKeeper);
      if (!cand.length) blocks.push(text('Sem companheiro de linha para receber no espaço. Volte e escolha outra ação.'));
      else
        blocks.push(
          selectBlock(
            select(
              cid(P, 'cell', matchId),
              'Casa do passe (número na imagem)',
              cand.map((c, i) => {
                const ally = [...allies].sort((x, y) => cheb(x.pos, c) - cheb(y.pos, c))[0];
                const rel = ally ? relativeFrom(p.team, ally.pos, c) : '';
                return { label: `Casa ${i + 1}`, value: `${c.x},${c.y}`, description: ally ? (rel ? `${rel} de ${nameOf(state, ally.id)}` : `no pé de ${nameOf(state, ally.id)}`) : relative(state, slotId, c), default: same(d.targetCell, c) };
              }),
            ),
          ),
        );
    } else if (need === 'zone' && !isGk) {
      blocks.push(text('-# O gol visto de frente:'));
      blocks.push(row(...ZONES.slice(0, 3).map((z) => btn(cid(P, 'zone', matchId, z), GOAL_ZONE_LABEL[z], d.shotZone === z ? ButtonStyle.Success : ButtonStyle.Secondary))));
      blocks.push(row(...ZONES.slice(3).map((z) => btn(cid(P, 'zone', matchId, z), GOAL_ZONE_LABEL[z], d.shotZone === z ? ButtonStyle.Success : ButtonStyle.Secondary))));
    } else if (need === 'guess') {
      blocks.push(text(GUESSES.map((g) => `-# **${READ_GUESS_LABEL[g]}:** ${GUESS_HELP[g]}`).join('\n')));
      blocks.push(row(...GUESSES.map((g) => btn(cid(P, 'guess', matchId, g), READ_GUESS_LABEL[g], d.readGuess === g ? ButtonStyle.Success : ButtonStyle.Secondary))));
    }
    // goleiro sem bola: sempre escolhe o canto que cobre (inclusive ao Comandar)
    if (isGk) {
      blocks.push(text('-# Canto que você cobre, com o gol visto de frente:'));
      blocks.push(row(...ZONES.slice(0, 3).map((z) => btn(cid(P, 'kz', matchId, z), GOAL_ZONE_LABEL[z], d.keeperZone === z ? ButtonStyle.Success : ButtonStyle.Secondary))));
      blocks.push(row(...ZONES.slice(3).map((z) => btn(cid(P, 'kz', matchId, z), GOAL_ZONE_LABEL[z], d.keeperZone === z ? ButtonStyle.Success : ButtonStyle.Secondary))));
    }
    nav.push(btn(cid(P, 'ok', matchId), ctx.confirmLabel ?? 'Confirmar plano', ButtonStyle.Success, !!miss));
  }

  // resumo e navegação
  if (d.action) {
    blocks.push(sep());
    blocks.push(text(`${describePlan(state, slotId, d).join('\n')}${miss ? `\n-# Falta: ${miss.replace(/\.$/, '').toLowerCase()}.` : ''}`));
  }
  if (nav.length) blocks.push(row(...nav, ...(d.action ? [btn(cid(P, 'clear', matchId), 'Recomeçar')] : [])));
  return { accent: 'padrao', blocks, files };
}

// ---------------------------------------------------------------------------
// Cliques
// ---------------------------------------------------------------------------

/** Se o destino saiu do alcance (extra desligado), puxa para a casa alcançável mais perto. */
function clampDest(state: MatchState, slotId: string, d: Draft) {
  if (!d.dest) return;
  const cells = reachFor(state, slotId, d);
  if (cells.some((c) => same(c, d.dest))) return;
  d.dest = nearestTo(cells, d.dest, state.players[slotId].pos) ?? { ...state.players[slotId].pos };
}

/** Aplica um clique no rascunho. Retorna 'confirm' quando o plano está pronto para valer. */
export function applyClick(
  state: MatchState,
  slotId: string,
  d: Draft,
  action: string,
  arg: string | undefined,
  values: string[] | null,
  ctx: Pick<PanelContext, 'mode' | 'reaction'> = { mode: 'plan' },
): 'confirm' | 'update' {
  d.error = null;
  const pos = state.players[slotId].pos;
  const flags = flagsOf(ctx);
  switch (action) {
    case 'act': {
      const a = (values?.[0] ?? arg) as ActionKind;
      if (!actionsFor(state, slotId, ctx.reaction).includes(a)) {
        d.error = 'Essa ação não está disponível agora.';
        break;
      }
      const changed = d.action !== a;
      d.action = a;
      if (changed) {
        d.targetPlayer = null;
        d.targetCell = null;
        d.readGuess = null;
        if (actionNeeds(a) !== 'zone') d.shotZone = null;
      }
      if (a === 'proteger' || !d.dest) d.dest = { ...pos };
      if (d.skill) {
        const opt = skillOptions(state, slotId, a).find((o) => o.skillId === d.skill);
        if (!opt?.usable) d.skill = null;
      }
      // avança sozinho para a próxima etapa
      const steps = stepsOf(state, slotId, d, flags);
      d.step = steps[steps.indexOf('action') + 1] ?? 'action';
      break;
    }
    case 'go':
      if (arg === 'action' || arg === 'dest' || arg === 'target') d.step = arg;
      break;
    case 'mv': {
      const [dx, dy] = (arg ?? '').split(',').map(Number);
      const cur = d.dest ?? pos;
      const next = { x: cur.x + dx, y: cur.y + dy };
      if (reachFor(state, slotId, d).some((c) => same(c, next))) d.dest = next;
      else d.error = 'Essa casa está fora do seu alcance neste lance.';
      break;
    }
    case 'stay':
      d.dest = { ...pos };
      break;
    case 'sc':
    case 'dest': {
      const c = parseCell(values?.[0]);
      if (c && reachFor(state, slotId, d).some((x) => same(x, c))) d.dest = c;
      else d.error = 'Essa casa está fora do seu alcance neste lance.';
      break;
    }
    case 'tgt':
      d.targetPlayer = arg ?? null;
      break;
    case 'cell':
      d.targetCell = parseCell(values?.[0]);
      break;
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
      clampDest(state, slotId, d);
      break;
    case 'skill':
      d.skill = d.skill === arg ? null : (arg ?? null);
      clampDest(state, slotId, d);
      break;
    case 'flow':
      d.useFlow = !d.useFlow;
      clampDest(state, slotId, d);
      break;
    case 'clear':
      Object.assign(d, { dest: undefined, action: undefined, targetPlayer: null, targetCell: null, shotZone: null, readGuess: null, skill: null, useFlow: false, sprint: false, step: stepsOf(state, slotId, d, flags)[0] ?? 'action' });
      if (state.players[slotId].isKeeper) d.keeperZone = 1;
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
