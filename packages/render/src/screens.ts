import { createCanvas } from '@napi-rs/canvas';
import { gifenc } from './gif';
import {
  COLORS,
  DIFFICULTY_LABEL,
  GAME,
  PERSONALITY_LABEL,
  RARITY_COLORS,
  RARITY_LABEL,
  getLineage,
  type Rarity,
  type SelectionStage,
} from '@ego/content';
import { PHYSICAL, TRAINING_ROUNDS, type DuelTrainingState, type PhysicalState } from '@ego/engine';
import { lineagePortrait, svgImage } from './art';
import { FONT, bar, cutRect, ensureFonts, fitText, gridTexture, text, withAlpha } from './draw';
import { logoSvg } from './svg';

const { GIFEncoder, applyPalette, quantize } = gifenc;

const CHOICE_LABEL: Record<string, string> = {
  driblar: 'DRIBLAR',
  proteger: 'PROTEGER',
  passar: 'PASSAR',
  bote: 'BOTE',
  conter: 'CONTER',
  fechar_linha: 'FECHAR LINHA',
};

function base(w: number, h: number, label: string) {
  ensureFonts();
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  gridTexture(ctx, 0, 0, w, h, 24, COLORS.line, 0.4);
  ctx.fillStyle = COLORS.electric;
  ctx.fillRect(0, 0, 6, h);
  text(ctx, label, 24, 30, FONT.mono(13, 600), COLORS.electricBright);
  return { canvas, ctx };
}

// ---------------------------------------------------------------------------
// Treinos de duelo (drible / desarme)
// ---------------------------------------------------------------------------

export function renderDuelTraining(s: DuelTrainingState): Buffer {
  const W = 720;
  const H = 300;
  const { canvas, ctx } = base(W, H, s.kind === 'drible' ? 'TREINO DE DRIBLE' : 'TREINO DE DESARME');
  const round = s.finished ? TRAINING_ROUNDS : s.round;
  text(ctx, `RODADA ${round}/${TRAINING_ROUNDS}`, W - 24, 30, FONT.mono(13, 600), COLORS.muted, 'right');
  // placar de acertos
  for (let i = 0; i < TRAINING_ROUNDS; i++) {
    const h = s.history[i];
    ctx.fillStyle = !h ? COLORS.line : h.win ? COLORS.success : COLORS.alert;
    cutRect(ctx, 24 + i * 46, 50, 38, 14, 4);
    ctx.fill();
  }
  text(ctx, `${s.hits}`, W - 24, 118, FONT.display(64), '#FFFFFF', 'right');
  text(ctx, 'ACERTOS', W - 24, 140, FONT.mono(12, 600), COLORS.muted, 'right');
  // último duelo
  const last = s.history[s.history.length - 1];
  if (last) {
    const you = s.kind === 'drible' ? 'VOCÊ' : 'VOCÊ';
    text(ctx, you, 24, 112, FONT.mono(12, 600), COLORS.muted);
    text(ctx, CHOICE_LABEL[last.player] ?? last.player, 24, 150, FONT.display(40), '#FFFFFF');
    text(ctx, `${s.kind === 'drible' ? last.atk : last.def}`, 24, 190, FONT.display(34), COLORS.electricBright);
    text(ctx, 'BOT', 330, 112, FONT.mono(12, 600), COLORS.muted);
    text(ctx, CHOICE_LABEL[last.bot] ?? last.bot, 330, 150, FONT.display(40), '#FFFFFF');
    text(ctx, `${s.kind === 'drible' ? last.def : last.atk}`, 330, 190, FONT.display(34), COLORS.amber);
    text(ctx, last.win ? 'VENCEU' : 'PERDEU', 24, 250, FONT.display(34), last.win ? COLORS.success : COLORS.alert);
  } else {
    text(ctx, s.kind === 'drible' ? 'O defensor já escolheu.' : 'O atacante já escolheu.', 24, 140, FONT.display(34), '#FFFFFF');
    text(ctx, 'Leia e responda.', 24, 180, FONT.body(20, 600), COLORS.muted);
  }
  if (!s.finished && s.hint) {
    ctx.fillStyle = withAlpha(COLORS.electric, 0.15);
    cutRect(ctx, 330, 218, 366, 48, 10);
    ctx.fill();
    text(ctx, 'LEITURA (VISÃO)', 346, 238, FONT.mono(11, 600), COLORS.electricBright);
    text(ctx, `Inclinação: ${CHOICE_LABEL[s.hint] ?? s.hint}`, 346, 258, FONT.body(16, 600), '#FFFFFF');
  }
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Treino físico
// ---------------------------------------------------------------------------

export function renderPhysical(s: PhysicalState): Buffer {
  const W = 760;
  const H = 320;
  const { canvas, ctx } = base(W, H, 'TREINO FÍSICO');
  text(ctx, `RODADA ${Math.min(s.round, TRAINING_ROUNDS)}/${TRAINING_ROUNDS}`, W - 24, 30, FONT.mono(13, 600), COLORS.muted, 'right');
  const tx = 60;
  const ty = 60;
  const tw = W - 120;
  const laneH = 52;
  const len = PHYSICAL.trackLength;
  const step = tw / len;
  for (let l = 0; l < 3; l++) {
    const y = ty + l * laneH;
    ctx.fillStyle = l % 2 ? '#0C1822' : '#0A141C';
    ctx.fillRect(tx, y, tw, laneH - 4);
    text(ctx, String(l + 1), tx - 24, y + laneH / 2 + 6, FONT.display(22), COLORS.muted, 'center');
    for (let i = 1; i < len; i++) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(tx + i * step, y, 1, laneH - 4);
    }
    // obstáculo da rodada (à frente do corredor)
    if (!s.finished && s.obstacles[l]) {
      const ox = tx + Math.min(len - 1, s.distance + 1.5) * step;
      ctx.fillStyle = COLORS.amber;
      for (let k = 0; k < 3; k++) ctx.fillRect(ox + k * 6, y + 8, 3, laneH - 20);
    }
  }
  // chegada
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(tx + tw - 4, ty, 4, laneH * 3 - 4);
  // corredor
  const rx = tx + Math.min(len, s.distance) * step;
  const ry = ty + s.lane * laneH + laneH / 2 - 2;
  ctx.fillStyle = COLORS.electric;
  ctx.beginPath();
  ctx.arc(rx, ry, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  // fôlego
  text(ctx, 'FÔLEGO', tx, 250, FONT.mono(12, 600), COLORS.muted);
  bar(ctx, tx, 258, 300, 12, s.stamina / 100, s.stamina < 30 ? COLORS.amber : COLORS.success);
  text(ctx, String(s.stamina), tx + 312, 270, FONT.display(20), '#FFFFFF');
  text(ctx, `${Math.min(s.distance, len)}/${len}`, W - 60, 272, FONT.display(40), '#FFFFFF', 'right');
  const last = s.history[s.history.length - 1];
  if (last) text(ctx, last.obstacle ? (last.cleared ? 'Obstáculo superado.' : 'Tropeçou no obstáculo.') : `+${last.advance} casas.`, tx, 300, FONT.body(16, 600), last.obstacle && !last.cleared ? COLORS.alert : '#FFFFFF');
  if (s.finished) text(ctx, s.completed ? 'CHEGOU' : 'NÃO CHEGOU', W - 60, 232, FONT.display(28), s.completed ? COLORS.success : COLORS.alert, 'right');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Modo Seleção
// ---------------------------------------------------------------------------

export async function renderStage(stage: SelectionStage, groupName: string, status: { cleared: boolean; unlocked: boolean; wins: number }): Promise<Buffer> {
  const W = 900;
  const H = 360;
  const { canvas, ctx } = base(W, H, groupName.toUpperCase());
  text(ctx, `${stage.mode}  ·  ${stage.boss ? 'CHEFE' : DIFFICULTY_LABEL[stage.difficulty].toUpperCase()}`, W - 24, 30, FONT.mono(13, 600), stage.boss ? COLORS.alert : COLORS.muted, 'right');
  fitText(ctx, stage.name.toUpperCase(), 24, 96, 520, FONT.display, 54, '#FFFFFF');
  text(ctx, stage.subtitle, 24, 130, FONT.body(19, 600), COLORS.muted);
  const stateLabel = !status.unlocked ? 'BLOQUEADA' : status.cleared ? `SUPERADA · ${status.wins} VITÓRIA(S)` : 'DISPONÍVEL';
  text(ctx, stateLabel, 24, 170, FONT.mono(14, 600), !status.unlocked ? COLORS.alert : status.cleared ? COLORS.success : COLORS.electricBright);
  // adversários
  let x = 24;
  for (const o of stage.opponents) {
    const l = getLineage(o.lineageId);
    const img = await lineagePortrait(o.lineageId, 128);
    ctx.drawImage(img, x, 196, 110, 110);
    text(ctx, o.name.toUpperCase(), x, 330, FONT.cond(18, 700), '#FFFFFF');
    text(ctx, `${l.name} · Nv ${o.level} · ${PERSONALITY_LABEL[o.personality]}`, x, 350, FONT.mono(11), RARITY_COLORS[l.rarity]);
    x += 200;
  }
  // orçamento
  text(ctx, 'ORÇAMENTO DE RARIDADE', W - 24, 250, FONT.mono(12, 600), COLORS.muted, 'right');
  text(ctx, String(stage.rarityBudget), W - 24, 310, FONT.display(64), '#FFFFFF', 'right');
  if (!status.unlocked) {
    ctx.fillStyle = 'rgba(7,11,18,0.55)';
    ctx.fillRect(0, 0, W, H);
  }
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Giro de linhagem
// ---------------------------------------------------------------------------

/** Nota de avaliação exibida no giro: faixa por raridade, determinística pelo id do log. */
export function evaluationScore(rarity: Rarity, key: string): number {
  const ranges: Record<Rarity, [number, number]> = { comum: [18, 44], rara: [45, 67], epica: [68, 85], lendaria: [86, 96], mitica: [97, 99] };
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const [a, b] = ranges[rarity];
  return a + (h % (b - a + 1));
}

async function gachaFrame(t: number, rarity: Rarity, lineageId: string, score: number) {
  const W = 640;
  const H = 360;
  const { canvas, ctx } = base(W, H, `AVALIAÇÃO DE LINHAGEM  ·  ${GAME.name}`);
  const color = RARITY_COLORS[rarity];
  const shown = Math.min(score, Math.round(score * Math.min(1, t / 0.7)));
  // varredura
  const scanY = 50 + ((t * 3) % 1) * (H - 70);
  ctx.fillStyle = withAlpha(COLORS.electric, 0.18);
  ctx.fillRect(0, scanY, W, 3);
  if (t < 0.75) {
    text(ctx, 'ANALISANDO', 32, 110, FONT.mono(16, 600), COLORS.muted);
    text(ctx, String(shown).padStart(2, '0'), 32, 250, FONT.display(160), '#FFFFFF');
    bar(ctx, 32, 290, W - 64, 8, t / 0.75, COLORS.electric);
  } else {
    // revelação
    ctx.fillStyle = withAlpha(color, 0.18);
    ctx.beginPath();
    ctx.moveTo(W * 0.45, 40);
    ctx.lineTo(W, 40);
    ctx.lineTo(W, H);
    ctx.lineTo(W * 0.3, H);
    ctx.closePath();
    ctx.fill();
    const l = getLineage(lineageId);
    const img = await lineagePortrait(lineageId, 256);
    ctx.drawImage(img, W - 250, 70, 220, 220);
    text(ctx, String(score), 32, 180, FONT.display(120), color);
    text(ctx, RARITY_LABEL[rarity].toUpperCase(), 32, 226, FONT.display(40), color);
    fitText(ctx, l.name.toUpperCase(), 32, 290, 330, FONT.display, 54, '#FFFFFF');
    text(ctx, l.tagline, 32, 322, FONT.body(15, 600), COLORS.muted);
  }
  return canvas;
}

/** Animação curta do giro (GIF): tela de avaliação, número subindo, raridade revelada. */
export async function renderGachaGif(rarity: Rarity, lineageId: string, key: string): Promise<Buffer> {
  ensureFonts();
  const score = evaluationScore(rarity, key);
  const gif = GIFEncoder();
  const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  for (const t of times) {
    const c = await gachaFrame(t, rarity, lineageId, score);
    const ctx = c.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const palette = quantize(data, 128);
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: t >= 0.8 ? 4000 : 140, repeat: -1 });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

export async function renderGachaResult(rarity: Rarity, lineageId: string, key: string): Promise<Buffer> {
  const c = await gachaFrame(1, rarity, lineageId, evaluationScore(rarity, key));
  return c.toBuffer('image/png');
}

/** Banner simples com o logo (usado em telas sem imagem própria). */
export async function renderBanner(title: string, subtitle: string, accent: string = COLORS.electric): Promise<Buffer> {
  const W = 900;
  const H = 220;
  const { canvas, ctx } = base(W, H, GAME.name);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 6, H);
  fitText(ctx, title.toUpperCase(), 24, 130, W - 220, FONT.display, 72, '#FFFFFF');
  text(ctx, subtitle, 24, 172, FONT.body(20, 600), COLORS.muted);
  const logo = await svgImage(logoSvg({ height: 48, withWordmark: false }), 'logo:mark:48');
  ctx.drawImage(logo, W - 90, 40, 64, 64);
  return canvas.toBuffer('image/png');
}
