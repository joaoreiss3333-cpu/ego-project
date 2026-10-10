import { createCanvas } from '@napi-rs/canvas';
import {
  ATTRS,
  ATTR_SHORT,
  COLORS,
  GAME,
  POSITION_LABEL,
  RARITY_COLORS,
  RARITY_LABEL,
  findCosmetic,
  type Attrs,
  type Position,
  type Rarity,
} from '@ego/content';
import { lineagePortrait, playerPortrait, svgImage } from './art';
import { FONT, bar, cutRect, ensureFonts, fitText, gridTexture, text, withAlpha, type Ctx } from './draw';
import { frameSvg, logoSvg, titlePlateSvg } from './svg';

export interface ProfileCardData {
  name: string;
  number: number;
  position: Position;
  tokenColor: string;
  level: number;
  xp: number;
  xpNeeded: number;
  lineage: { id: string; name: string; rarity: Rarity } | null;
  rank: { solo: number | null; time: number | null; mmrSolo: number; mmrTime: number };
  attrs: Attrs;
  caps: Attrs;
  titleId?: string | null;
  frameId?: string | null;
  portraitPath?: string | null;
  marketValue: number;
  stats: { goals: number; assists: number; matches: number; wins: number };
  serial: string;
}

export function formatMoney(v: number): string {
  if (v >= 1_000_000) return `¥ ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',')} MI`;
  if (v >= 1000) return `¥ ${Math.round(v / 1000)} MIL`;
  return `¥ ${v}`;
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number, c = 14) {
  ctx.fillStyle = COLORS.panel;
  cutRect(ctx, x, y, w, h, c);
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function header(ctx: Ctx, w: number, label: string, serial: string) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = COLORS.electric;
  ctx.fillRect(0, 42, w, 2);
  text(ctx, label, 24, 29, FONT.mono(14, 600), COLORS.electricBright);
  text(ctx, serial, w - 24, 29, FONT.mono(14, 600), COLORS.muted, 'right');
}

/** Card de perfil: ficha de avaliação da instalação. */
export async function renderProfileCard(d: ProfileCardData): Promise<Buffer> {
  ensureFonts();
  const W = 1100;
  const H = 640;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, W, H);
  gridTexture(ctx, 0, 0, W, H, 32, COLORS.line, 0.45);
  // corte diagonal de fundo
  const rarityColor = d.lineage ? RARITY_COLORS[d.lineage.rarity] : COLORS.muted;
  ctx.fillStyle = withAlpha(rarityColor, 0.08);
  ctx.beginPath();
  ctx.moveTo(W * 0.52, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.36, H);
  ctx.closePath();
  ctx.fill();
  header(ctx, W, `FICHA DE AVALIAÇÃO  ·  ${GAME.name}`, `REG. ${d.serial}`);

  // retrato com moldura
  const px = 32;
  const py = 70;
  const pw = 330;
  const ph = 440;
  const portrait = await playerPortrait(d.portraitPath, d.tokenColor, undefined, 512);
  ctx.save();
  cutRect(ctx, px + 10, py + 10, pw - 20, ph - 20, 26);
  ctx.clip();
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(px, py, pw, ph);
  const scale = Math.max((pw - 20) / portrait.width, (ph - 20) / portrait.height);
  const iw = portrait.width * scale;
  const ih = portrait.height * scale;
  ctx.drawImage(portrait, px + pw / 2 - iw / 2, py + ph / 2 - ih / 2, iw, ih);
  ctx.restore();
  const frameId = d.frameId ?? (d.lineage ? `moldura_${d.lineage.rarity}` : 'moldura_comum');
  const frame = await svgImage(frameSvg(frameId, pw, ph), `frame:${frameId}:${pw}x${ph}`);
  ctx.drawImage(frame, px, py, pw, ph);
  // número da camisa sobre o retrato
  text(ctx, String(d.number), px + pw - 26, py + ph - 26, FONT.display(96), withAlpha('#FFFFFF', 0.92), 'right');
  text(ctx, POSITION_LABEL[d.position].toUpperCase(), px + 28, py + ph - 30, FONT.mono(16, 600), '#FFFFFF');

  // título
  if (d.titleId) {
    const t = findCosmetic(d.titleId);
    if (t) {
      const plate = await svgImage(titlePlateSvg(t.name, 260, 46), `title:${t.id}`);
      ctx.drawImage(plate, px + 34, py + ph + 18, 260, 46);
    }
  }

  // coluna direita
  const rx = 396;
  // ranking gigante
  const pos = d.rank.solo ?? d.rank.time;
  text(ctx, 'POSIÇÃO NO RANKING', rx, 92, FONT.mono(13, 600), COLORS.muted);
  text(ctx, pos ? `#${pos}` : '#—', rx - 4, 210, FONT.display(128), COLORS.electric);
  ctx.font = FONT.display(128);
  const rw = ctx.measureText(pos ? `#${pos}` : '#—').width;
  text(ctx, d.rank.solo ? 'SOLO' : d.rank.time ? 'TIME' : 'SEM RANKING', rx + rw + 12, 150, FONT.mono(14, 600), COLORS.muted);
  text(ctx, `MMR ${d.rank.solo ? d.rank.mmrSolo : d.rank.mmrTime}`, rx + rw + 12, 172, FONT.mono(14, 600), '#FFFFFF');

  // nome
  fitText(ctx, d.name.toUpperCase(), rx, 280, W - rx - 40, FONT.display, 60, '#FFFFFF');
  // linhagem
  if (d.lineage) {
    const lp = await lineagePortrait(d.lineage.id, 96);
    ctx.save();
    cutRect(ctx, rx, 292, 56, 56, 10);
    ctx.clip();
    ctx.drawImage(lp, rx, 292, 56, 56);
    ctx.restore();
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 2;
    cutRect(ctx, rx, 292, 56, 56, 10);
    ctx.stroke();
    text(ctx, `LINHAGEM`, rx + 70, 310, FONT.mono(12, 600), COLORS.muted);
    text(ctx, d.lineage.name.toUpperCase(), rx + 70, 342, FONT.display(30), '#FFFFFF');
    ctx.font = FONT.display(30);
    const lw = ctx.measureText(d.lineage.name.toUpperCase()).width;
    ctx.fillStyle = rarityColor;
    cutRect(ctx, rx + 82 + lw, 318, 110, 26, 6);
    ctx.fill();
    text(ctx, RARITY_LABEL[d.lineage.rarity].toUpperCase(), rx + 137 + lw, 337, FONT.cond(17, 700), '#070B12', 'center');
  } else {
    text(ctx, 'SEM LINHAGEM · USE /girar', rx, 336, FONT.mono(16, 600), COLORS.amber);
  }

  // atributos
  const ax = rx;
  const ay = 380;
  panel(ctx, ax - 12, ay - 16, 400, 236);
  ATTRS.forEach((k, i) => {
    const y = ay + i * 31;
    text(ctx, ATTR_SHORT[k], ax, y + 14, FONT.mono(14, 600), COLORS.muted);
    const v = d.attrs[k];
    const cap = d.caps[k];
    const bx = ax + 48;
    const bw = 270;
    bar(ctx, bx, y + 2, bw, 14, v / 10, v > cap ? COLORS.electricBright : '#FFFFFF');
    // teto
    ctx.fillStyle = rarityColor;
    ctx.fillRect(bx + (cap / 10) * bw - 1, y - 2, 3, 22);
    text(ctx, String(v).padStart(2, '0'), ax + 336, y + 17, FONT.display(22), '#FFFFFF');
    text(ctx, `/${cap}`, ax + 364, y + 16, FONT.mono(11), COLORS.muted);
  });

  // dados à direita
  const dx = 822;
  panel(ctx, dx - 12, 364, 260, 252);
  const kv = (label: string, value: string, y: number, big = false) => {
    text(ctx, label, dx, y, FONT.mono(12, 600), COLORS.muted);
    text(ctx, value, dx, y + (big ? 36 : 26), big ? FONT.display(34) : FONT.display(24), '#FFFFFF');
  };
  kv('NÍVEL', String(d.level).padStart(2, '0'), 388, true);
  bar(ctx, dx + 70, 408, 160, 6, d.xpNeeded ? d.xp / d.xpNeeded : 1, COLORS.electric);
  text(ctx, d.xpNeeded ? `${d.xp}/${d.xpNeeded} XP` : 'MÁXIMO', dx + 70, 428, FONT.mono(11), COLORS.muted);
  kv('VALOR DE MERCADO', formatMoney(d.marketValue), 458);
  text(ctx, 'GOLS', dx, 530, FONT.mono(12, 600), COLORS.muted);
  text(ctx, 'ASSIST.', dx + 80, 530, FONT.mono(12, 600), COLORS.muted);
  text(ctx, 'VITÓRIAS', dx + 160, 530, FONT.mono(12, 600), COLORS.muted);
  text(ctx, String(d.stats.goals), dx, 566, FONT.display(32), '#FFFFFF');
  text(ctx, String(d.stats.assists), dx + 80, 566, FONT.display(32), '#FFFFFF');
  text(ctx, `${d.stats.wins}/${d.stats.matches}`, dx + 160, 566, FONT.display(32), '#FFFFFF');
  text(ctx, 'PARTIDAS', dx + 160, 590, FONT.mono(10), COLORS.muted);

  // rodapé
  const logo = await svgImage(logoSvg({ height: 28 }), 'logo:28');
  ctx.drawImage(logo, 32, H - 44, (logo.width * 28) / logo.height, 28);
  text(ctx, 'AVALIAÇÃO CONTÍNUA. O RANKING MUDA A CADA PARTIDA.', W - 24, H - 22, FONT.mono(11), COLORS.muted, 'right');
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Resultado da partida
// ---------------------------------------------------------------------------

export interface ResultPlayer {
  name: string;
  number: number;
  team: 'A' | 'B';
  lineageId: string;
  rarity: Rarity;
  goals: number;
  assists: number;
  ego: number;
  chem: number;
  dribbles: number;
  reads: number;
  saves: number;
  isKeeper: boolean;
  isBot: boolean;
}

export interface ResultCardData {
  score: { A: number; B: number };
  winner: 'A' | 'B' | 'draw' | null;
  mode: string;
  kindLabel: string;
  players: ResultPlayer[];
  teamColors: { A: string; B: string };
  serial: string;
}

export async function renderResultCard(d: ResultCardData): Promise<Buffer> {
  ensureFonts();
  const W = 1100;
  const H = 560;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, W, H);
  gridTexture(ctx, 0, 0, W, H, 32, COLORS.line, 0.4);
  header(ctx, W, `RELATÓRIO DE PARTIDA  ·  ${d.kindLabel.toUpperCase()}  ·  ${d.mode}`, `REG. ${d.serial}`);
  // placar
  const label = d.winner === 'draw' ? 'EMPATE' : d.winner ? `VITÓRIA DO TIME ${d.winner}` : 'ENCERRADA';
  text(ctx, label, W / 2, 72, FONT.mono(16, 600), d.winner === 'draw' ? COLORS.muted : COLORS.electricBright, 'center');
  text(ctx, `${d.score.A}`, W / 2 - 60, 226, FONT.display(136), '#FFFFFF', 'right');
  text(ctx, ':', W / 2, 205, FONT.display(110), COLORS.muted, 'center');
  text(ctx, `${d.score.B}`, W / 2 + 60, 226, FONT.display(136), '#FFFFFF', 'left');
  ctx.fillStyle = d.teamColors.A;
  ctx.fillRect(W / 2 - 250, 110, 10, 110);
  ctx.fillStyle = d.teamColors.B;
  ctx.fillRect(W / 2 + 240, 110, 10, 110);
  text(ctx, 'TIME A', W / 2 - 230, 130, FONT.mono(13, 600), COLORS.muted);
  text(ctx, 'TIME B', W / 2 + 230, 130, FONT.mono(13, 600), COLORS.muted, 'right');

  // listas por time
  const cols: Record<'A' | 'B', number> = { A: 32, B: W / 2 + 16 };
  for (const team of ['A', 'B'] as const) {
    const list = d.players.filter((p) => p.team === team).sort((a, b) => Number(a.isKeeper) - Number(b.isKeeper));
    const x = cols[team];
    panel(ctx, x, 250, W / 2 - 48, 30 + list.length * 38);
    text(ctx, 'JOGADOR', x + 16, 272, FONT.mono(11, 600), COLORS.muted);
    const heads = ['G', 'A', 'EGO', 'QUÍ'];
    heads.forEach((h, i) => text(ctx, h, x + 330 + i * 48, 272, FONT.mono(11, 600), COLORS.muted, 'center'));
    list.forEach((p, i) => {
      const y = 300 + i * 38;
      ctx.fillStyle = RARITY_COLORS[p.rarity];
      ctx.fillRect(x + 14, y - 14, 4, 26);
      text(ctx, String(p.number), x + 30, y + 6, FONT.display(20), '#FFFFFF');
      fitText(ctx, `${p.name}${p.isBot ? ' (bot)' : ''}`, x + 66, y + 6, 240, (px) => FONT.cond(px, 600), 20, '#FFFFFF');
      [p.goals, p.assists, p.ego, p.chem].forEach((v, k) => text(ctx, String(v), x + 330 + k * 48, y + 6, FONT.display(20), v ? '#FFFFFF' : COLORS.muted, 'center'));
    });
  }

  // destaques
  const humans = d.players.filter((p) => !p.isKeeper);
  const top = (f: (p: ResultPlayer) => number) => [...humans].sort((a, b) => f(b) - f(a))[0];
  const highlights: [string, ResultPlayer | undefined, (p: ResultPlayer) => number][] = [
    ['MAIS EGO', top((p) => p.ego), (p) => p.ego],
    ['MAIS QUÍMICA', top((p) => p.chem), (p) => p.chem],
    ['DRIBLES', top((p) => p.dribbles), (p) => p.dribbles],
    ['LEITURAS', top((p) => p.reads), (p) => p.reads],
  ];
  highlights.forEach(([lbl, p, f], i) => {
    const x = 32 + i * 264;
    const y = H - 70;
    text(ctx, lbl, x, y, FONT.mono(11, 600), COLORS.muted);
    text(ctx, p && f(p) > 0 ? `${p.name.toUpperCase()}  ${f(p)}` : '—', x, y + 28, FONT.display(22), '#FFFFFF');
  });
  return canvas.toBuffer('image/png');
}
