import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { gifenc } from './gif';
import { COLORS, MASTERY, MATCH_RULES, RARITY_COLORS, findCosmetic, findSkill, getLineage, masteryLevel } from '@ego/content';
import {
  goalRows,
  hasStatus,
  isInArea,
  zoneRadius,
  type ArrowCategory,
  type Cell,
  type MatchState,
  type PublicArrow,
  type StepFrame,
  type TurnResult,
} from '@ego/engine';
import { FONT, arrowHead, cutRect, ensureFonts, isLightColor, text, withAlpha, type Ctx } from './draw';

export type ArrowKind = ArrowCategory | 'habilidade';

export interface ArrowSpec {
  from: Cell;
  to: Cell;
  kind: ArrowKind;
  /** Nível de maestria da habilidade usada (III+ muda o visual). */
  mastery?: number;
  sprint?: boolean;
}

export interface Overlays {
  duels?: { cell: Cell; won: 'atk' | 'def' }[];
  passes?: { from: Cell; to: Cell; ok: boolean }[];
  shots?: { from: Cell; to: Cell; goal: boolean; trail?: boolean }[];
  reading?: Cell[];
}

export interface FieldOptions {
  cell?: number;
  hud?: boolean;
  hudRight?: string;
  arrows?: ArrowSpec[];
  overlays?: Overlays;
  showZones?: boolean;
  /** Casas numeradas (painel de planejamento). A ordem define o número. */
  numbered?: Cell[];
  /** Recorte em casas (inclusive). */
  crop?: { x0: number; y0: number; x1: number; y1: number };
  highlight?: string | null;
  /** Sobrescreve posições (quadros do GIF). */
  frame?: StepFrame;
  labels?: boolean;
}

const { GIFEncoder, applyPalette, quantize } = gifenc;

const FIELD = {
  base: '#0A171C',
  stripe: '#0C1C22',
  grid: '#1A3440',
  line: 'rgba(255,255,255,0.55)',
  area: withAlpha(COLORS.electric, 0.55),
};

export const ARROW_COLOR: Record<ArrowKind, string> = {
  ataque: '#FFFFFF',
  apoio: COLORS.electricBright,
  defesa: '#F2B84B',
  goleiro: '#9FB3C8',
  habilidade: COLORS.electric,
};

interface Geo {
  s: number;
  ox: number;
  oy: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
}

function center(g: Geo, c: Cell) {
  return { x: g.ox + (c.x - g.x0) * g.s + g.s / 2, y: g.oy + (c.y - g.y0) * g.s + g.s / 2 };
}

function inCrop(g: Geo, c: Cell) {
  return c.x >= g.x0 && c.y >= g.y0 && c.x < g.x0 + g.cols && c.y < g.y0 + g.rows;
}

function drawPitch(ctx: Ctx, state: MatchState, g: Geo) {
  const f = state.setup.field;
  for (let x = g.x0; x < g.x0 + g.cols; x++) {
    ctx.fillStyle = x % 2 === 0 ? FIELD.base : FIELD.stripe;
    ctx.fillRect(g.ox + (x - g.x0) * g.s, g.oy, g.s, g.rows * g.s);
  }
  // áreas dos goleiros
  for (const team of ['A', 'B'] as const) {
    for (let x = g.x0; x < g.x0 + g.cols; x++)
      for (let y = g.y0; y < g.y0 + g.rows; y++) {
        if (!isInArea({ x, y }, team, f)) continue;
        ctx.fillStyle = withAlpha(COLORS.electric, 0.07);
        ctx.fillRect(g.ox + (x - g.x0) * g.s, g.oy + (y - g.y0) * g.s, g.s, g.s);
      }
  }
  // grade
  ctx.strokeStyle = FIELD.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= g.cols; i++) {
    ctx.moveTo(g.ox + i * g.s + 0.5, g.oy);
    ctx.lineTo(g.ox + i * g.s + 0.5, g.oy + g.rows * g.s);
  }
  for (let j = 0; j <= g.rows; j++) {
    ctx.moveTo(g.ox, g.oy + j * g.s + 0.5);
    ctx.lineTo(g.ox + g.cols * g.s, g.oy + j * g.s + 0.5);
  }
  ctx.stroke();
  // linha do meio e contorno
  ctx.strokeStyle = FIELD.line;
  ctx.lineWidth = 2;
  const midX = f.width / 2;
  if (midX > g.x0 && midX < g.x0 + g.cols) {
    const px = g.ox + (midX - g.x0) * g.s;
    ctx.beginPath();
    ctx.moveTo(px, g.oy);
    ctx.lineTo(px, g.oy + g.rows * g.s);
    ctx.stroke();
    const cy = g.oy + (f.height / 2 - g.y0) * g.s;
    ctx.beginPath();
    ctx.arc(px, cy, g.s * 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeRect(g.ox + 1, g.oy + 1, g.cols * g.s - 2, g.rows * g.s - 2);
  // contorno das áreas
  ctx.strokeStyle = FIELD.area;
  ctx.lineWidth = 2;
  for (const team of ['A', 'B'] as const) {
    const rows = goalRows(f);
    const minY = rows[0] - MATCH_RULES.areaExtraRows;
    const maxY = rows[rows.length - 1] + MATCH_RULES.areaExtraRows;
    const x0 = team === 'A' ? 0 : f.width - MATCH_RULES.areaDepth;
    const c0 = center(g, { x: x0, y: minY });
    ctx.strokeRect(c0.x - g.s / 2, c0.y - g.s / 2, MATCH_RULES.areaDepth * g.s, (maxY - minY + 1) * g.s);
  }
  // gols: casas centrais da linha de fundo
  for (const gx of [0, f.width - 1]) {
    for (const y of goalRows(f)) {
      if (!inCrop(g, { x: gx, y })) continue;
      const c = center(g, { x: gx, y });
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(c.x - g.s / 2, c.y - g.s / 2, g.s, g.s);
      ctx.fillStyle = '#FFFFFF';
      const edge = gx === 0 ? c.x - g.s / 2 : c.x + g.s / 2 - 4;
      ctx.fillRect(edge, c.y - g.s / 2, 4, g.s);
      // rede
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(c.x - g.s / 2 + (k * g.s) / 4, c.y - g.s / 2);
        ctx.lineTo(c.x - g.s / 2 + (k * g.s) / 4, c.y + g.s / 2);
        ctx.stroke();
      }
    }
  }
}

function drawZones(ctx: Ctx, state: MatchState, g: Geo, pos: Record<string, Cell>) {
  for (const id of state.order) {
    const p = state.players[id];
    const r = zoneRadius(state, id);
    if (r <= 0) continue;
    const slot = state.setup.slots.find((s) => s.id === id)!;
    const c = pos[id];
    ctx.fillStyle = withAlpha(slot.team === 'A' ? COLORS.teamA : '#C9D3E0', r > 1 ? 0.14 : 0.1);
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (!dx && !dy) continue;
        const cell = { x: c.x + dx, y: c.y + dy };
        if (!inCrop(g, cell) || cell.x >= state.setup.field.width || cell.y >= state.setup.field.height || cell.x < 0 || cell.y < 0) continue;
        const cc = center(g, cell);
        ctx.fillRect(cc.x - g.s / 2 + 2, cc.y - g.s / 2 + 2, g.s - 4, g.s - 4);
      }
    void p;
  }
}

function drawArrow(ctx: Ctx, g: Geo, a: ArrowSpec) {
  const p1 = center(g, a.from);
  const p2 = center(g, a.to);
  if (a.from.x === a.to.x && a.from.y === a.to.y) {
    // ficou parado: marca curta em volta
    ctx.strokeStyle = withAlpha(ARROW_COLOR[a.kind], 0.8);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(p1.x - g.s * 0.42, p1.y - g.s * 0.42, g.s * 0.84, g.s * 0.84);
    ctx.setLineDash([]);
    return;
  }
  const color = ARROW_COLOR[a.kind];
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const ux = (p2.x - p1.x) / len;
  const uy = (p2.y - p1.y) / len;
  const sx = p1.x + ux * g.s * 0.34;
  const sy = p1.y + uy * g.s * 0.34;
  const ex = p2.x - ux * g.s * 0.2;
  const ey = p2.y - uy * g.s * 0.2;
  ctx.save();
  if (a.kind === 'habilidade') {
    ctx.strokeStyle = withAlpha(COLORS.electric, 0.35);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = a.sprint ? 5 : 3;
  if (a.kind === 'defesa' || a.kind === 'goleiro') ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  arrowHead(ctx, sx, sy, ex, ey, 14);
  // maestria III+: divisas ao longo da seta
  if ((a.mastery ?? 0) >= MASTERY.visualLevel) {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    const n = Math.max(1, Math.floor(len / (g.s * 0.8)));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const cx = sx + (ex - sx) * t;
      const cy = sy + (ey - sy) * t;
      const px = -uy * 7;
      const py = ux * 7;
      ctx.beginPath();
      ctx.moveTo(cx + px - ux * 6, cy + py - uy * 6);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - px - ux * 6, cy - py - uy * 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawToken(ctx: Ctx, state: MatchState, g: Geo, id: string, c: Cell, holder: string | null, highlight: boolean, labels: boolean) {
  const slot = state.setup.slots.find((s) => s.id === id)!;
  const p = state.players[id];
  const { x, y } = center(g, c);
  const r = g.s * 0.34;
  const rarity = getLineage(slot.lineageId).rarity;
  const teamColor = slot.team === 'A' ? slot.color || COLORS.teamA : COLORS.teamB;
  const flowReady = p.flow >= 100;
  const inFlow = p.statuses.some((st) => ['ego_awake', 'perfect_ginga', 'zone_radius', 'all_plus'].includes(st.kind) && st.until >= state.turn - 1);
  if (highlight) {
    ctx.strokeStyle = COLORS.electricBright;
    ctx.lineWidth = 3;
    cutRect(ctx, x - g.s / 2 + 3, y - g.s / 2 + 3, g.s - 6, g.s - 6, 8);
    ctx.stroke();
  }
  if (flowReady || inFlow) {
    ctx.fillStyle = withAlpha(COLORS.electric, inFlow ? 0.45 : 0.25);
    ctx.beginPath();
    ctx.arc(x, y, r + 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // anel de raridade (ou moldura equipada)
  const frame = findCosmetic(slot.frameId ?? null);
  ctx.strokeStyle = frame ? frame.color : RARITY_COLORS[rarity];
  ctx.lineWidth = frame ? 4 : 3;
  ctx.beginPath();
  if (slot.isKeeper) ctx.rect(x - r - 4, y - r - 4, (r + 4) * 2, (r + 4) * 2);
  else ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  if (frame?.id === 'moldura_grade') {
    ctx.strokeStyle = withAlpha(COLORS.electric, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - r - 8, y - r - 8, (r + 8) * 2, (r + 8) * 2);
  }
  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, String(slot.number), x, y + 1, FONT.display(Math.round(r * 0.95)), isLightColor(teamColor) ? '#070B12' : '#FFFFFF', 'center', 'middle');
  // posse
  if (holder === id) {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#070B12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + r * 0.85, y + r * 0.75, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // estados
  if (hasStatus(p, 'vendido', state.turn)) {
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y - r * 0.6);
    ctx.lineTo(x + r * 0.6, y + r * 0.6);
    ctx.moveTo(x + r * 0.6, y - r * 0.6);
    ctx.lineTo(x - r * 0.6, y + r * 0.6);
    ctx.stroke();
  }
  if (hasStatus(p, 'caido', state.turn)) {
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(x - r, y + r + 6, r * 2, 4);
  }
  if (p.rhythm > 0) {
    for (let i = 0; i < p.rhythm; i++) {
      ctx.fillStyle = COLORS.electricBright;
      ctx.fillRect(x - r + i * 8, y - r - 10, 6, 4);
    }
  }
  if (labels) {
    const name = slot.name.length > 11 ? `${slot.name.slice(0, 10)}.` : slot.name;
    ctx.font = FONT.cond(Math.max(11, Math.round(g.s * 0.2)), 600);
    const tw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(7,11,18,0.75)';
    ctx.fillRect(x - tw / 2 - 3, y + r + 4, tw + 6, Math.round(g.s * 0.22) + 2);
    text(ctx, name, x, y + r + 5, FONT.cond(Math.max(11, Math.round(g.s * 0.2)), 600), '#FFFFFF', 'center', 'top');
  }
}

function drawBallLoose(ctx: Ctx, g: Geo, c: Cell) {
  const { x, y } = center(g, c);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#070B12';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, g.s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = withAlpha('#FFFFFF', 0.6);
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, g.s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawOverlays(ctx: Ctx, g: Geo, o: Overlays) {
  for (const p of o.passes ?? []) {
    const a = center(g, p.from);
    const b = center(g, p.to);
    ctx.strokeStyle = p.ok ? '#FFFFFF' : COLORS.alert;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of o.shots ?? []) {
    const a = center(g, s.from);
    const b = center(g, s.to);
    if (s.trail) {
      // Faísca Azul: linha em zigue-zague com faíscas
      const n = 10;
      ctx.strokeStyle = COLORS.electricBright;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const off = i % 2 ? 6 : -6;
        const qx = px + (-(b.y - a.y) / len) * off;
        const qy = py + ((b.x - a.x) / len) * off;
        if (i === 0) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.strokeStyle = s.goal ? COLORS.electricBright : '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = s.goal ? COLORS.electricBright : '#FFFFFF';
    arrowHead(ctx, a.x, a.y, b.x, b.y, 16);
  }
  for (const d of o.duels ?? []) {
    const { x, y } = center(g, d.cell);
    const r = g.s * 0.22;
    ctx.save();
    ctx.translate(x, y - g.s * 0.42);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = d.won === 'atk' ? COLORS.electric : COLORS.amber;
    ctx.fillRect(-r / 2, -r / 2, r, r);
    ctx.restore();
    text(ctx, d.won === 'atk' ? 'A' : 'D', x, y - g.s * 0.42 + 1, FONT.cond(Math.round(r * 0.8), 700), '#070B12', 'center', 'middle');
  }
  for (const c of o.reading ?? []) {
    const { x, y } = center(g, c);
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - g.s * 0.45, 9, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(x, y - g.s * 0.45, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNumbers(ctx: Ctx, g: Geo, cells: Cell[]) {
  cells.forEach((c, i) => {
    if (!inCrop(g, c)) return;
    const { x, y } = center(g, c);
    ctx.fillStyle = 'rgba(31,107,255,0.14)';
    ctx.fillRect(x - g.s / 2 + 2, y - g.s / 2 + 2, g.s - 4, g.s - 4);
    ctx.strokeStyle = withAlpha(COLORS.electricBright, 0.8);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - g.s / 2 + 2.5, y - g.s / 2 + 2.5, g.s - 5, g.s - 5);
    const label = String(i + 1);
    const px = Math.round(g.s * (label.length > 2 ? 0.28 : 0.34));
    ctx.fillStyle = 'rgba(7,11,18,0.8)';
    ctx.fillRect(x - g.s / 2 + 3, y - g.s / 2 + 3, px * label.length * 0.62 + 8, px + 4);
    text(ctx, label, x - g.s / 2 + 6, y - g.s / 2 + 5, FONT.mono(px, 600), '#FFFFFF', 'left', 'top');
  });
}

const HUD_H = 52;

function drawHud(ctx: Ctx, state: MatchState, w: number, right?: string) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, HUD_H);
  ctx.fillStyle = COLORS.electric;
  ctx.fillRect(0, HUD_H - 3, w, 3);
  const aColor = state.setup.slots.find((s) => s.team === 'A' && !s.isKeeper)?.color ?? COLORS.teamA;
  let x = 16;
  const put = (str: string, font: string, color: string, gap: number, y = 38) => {
    ctx.font = font;
    text(ctx, str, x, y, font, color);
    x += ctx.measureText(str).width + gap;
  };
  ctx.fillStyle = aColor;
  ctx.fillRect(x, 14, 8, 24);
  x += 16;
  put('A', FONT.display(24), '#FFFFFF', 14);
  put(String(state.score.A), FONT.display(34), '#FFFFFF', 8, 40);
  put(':', FONT.display(28), COLORS.muted, 8);
  put(String(state.score.B), FONT.display(34), '#FFFFFF', 14, 40);
  put('B', FONT.display(24), '#FFFFFF', 8);
  ctx.fillStyle = COLORS.teamB;
  ctx.fillRect(x, 14, 8, 24);
  x += 28;
  const total = state.setup.turnsPerHalf;
  const turn = Math.min(state.turnInHalf, total);
  const info = state.finished ? 'FIM DE PARTIDA' : `LANCE ${String(turn).padStart(2, '0')}/${String(total).padStart(2, '0')}  ·  ${state.half}º TEMPO`;
  text(ctx, info, x, 34, FONT.mono(15, 600), COLORS.muted);
  if (right) text(ctx, right, w - 16, 34, FONT.mono(14, 600), COLORS.electricBright, 'right');
}

function geometry(state: MatchState, opts: FieldOptions): { g: Geo; w: number; h: number } {
  const f = state.setup.field;
  const s = opts.cell ?? (f.width > 13 ? 56 : 64);
  const crop = opts.crop ?? { x0: 0, y0: 0, x1: f.width - 1, y1: f.height - 1 };
  const cols = crop.x1 - crop.x0 + 1;
  const rows = crop.y1 - crop.y0 + 1;
  const hud = opts.hud !== false && !opts.crop;
  const pad = 14;
  const g: Geo = { s, ox: pad, oy: (hud ? HUD_H : 0) + pad, x0: crop.x0, y0: crop.y0, cols, rows };
  return { g, w: cols * s + pad * 2, h: rows * s + pad * 2 + (hud ? HUD_H : 0) };
}

export function drawField(state: MatchState, opts: FieldOptions = {}): Canvas {
  ensureFonts();
  const { g, w, h } = geometry(state, opts);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  if (opts.hud !== false && !opts.crop) drawHud(ctx, state, w, opts.hudRight);
  drawPitch(ctx, state, g);
  const pos: Record<string, Cell> = opts.frame ? opts.frame.positions : Object.fromEntries(state.order.map((id) => [id, state.players[id].pos]));
  const holder = opts.frame ? opts.frame.holder : state.ball.holder;
  const ball = opts.frame ? opts.frame.ball : state.ball.pos;
  // trilhas da Faixa de Aceleração
  for (const tr of state.trails) {
    for (const c of tr.cells) {
      if (!inCrop(g, c)) continue;
      const cc = center(g, c);
      ctx.fillStyle = withAlpha(COLORS.electric, 0.28);
      ctx.fillRect(cc.x - g.s / 2 + 1, cc.y - g.s / 2 + 1, g.s - 2, g.s - 2);
    }
  }
  if (opts.showZones) drawZones(ctx, state, g, pos);
  for (const a of opts.arrows ?? []) if (inCrop(g, a.from) || inCrop(g, a.to)) drawArrow(ctx, g, a);
  if (!holder && inCrop(g, ball)) drawBallLoose(ctx, g, ball);
  for (const id of state.order) {
    const c = pos[id];
    if (!inCrop(g, c)) continue;
    drawToken(ctx, state, g, id, c, holder, opts.highlight === id, opts.labels !== false);
  }
  if (opts.overlays) drawOverlays(ctx, g, opts.overlays);
  if (opts.numbered) drawNumbers(ctx, g, opts.numbered);
  return canvas;
}

export function renderField(state: MatchState, opts: FieldOptions = {}): Buffer {
  return drawField(state, opts).toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Setas da revelação e sobreposições da resolução
// ---------------------------------------------------------------------------

/** Setas públicas da revelação (destino + categoria; habilidade destacada). */
export function arrowsFromRevelation(state: MatchState, rev: PublicArrow[]): ArrowSpec[] {
  return rev.map((a) => ({
    from: a.from,
    to: a.dest,
    kind: a.usesSkill || a.usesFlow ? 'habilidade' : a.category,
    sprint: a.sprint,
  }));
}

/** Setas depois da resolução: caminho real de cada jogador, com maestria. */
export function arrowsFromResult(prev: MatchState, r: TurnResult): ArrowSpec[] {
  const out: ArrowSpec[] = [];
  for (const id of prev.order) {
    const path = r.paths[id];
    if (!path?.length) continue;
    const plan = r.plans[id];
    const slot = prev.setup.slots.find((s) => s.id === id)!;
    const skillId = plan.skill ?? (plan.useFlow ? slot.loadout.flow : null);
    const holder = prev.ball.holder;
    const cat: ArrowKind = skillId ? 'habilidade' : slot.isKeeper ? 'goleiro' : holder === id ? 'ataque' : holder && prev.players[holder].team === slot.team ? 'apoio' : 'defesa';
    out.push({
      from: prev.players[id].pos,
      to: path[path.length - 1],
      kind: cat,
      mastery: skillId ? masteryLevel(slot.mastery[skillId] ?? 0) : 0,
      sprint: !!plan.sprint,
    });
  }
  return out;
}

export function overlaysFromResult(prev: MatchState, r: TurnResult): Overlays {
  const o: Overlays = { duels: [], passes: [], shots: [] };
  const posAt = (id: string, step: number) => r.frames[Math.min(step, r.frames.length - 1)]?.positions[id] ?? prev.players[id].pos;
  const last = r.frames[r.frames.length - 2] ?? r.frames[r.frames.length - 1];
  const f = prev.setup.field;
  for (const e of r.events) {
    if (e.t === 'duel') o.duels!.push({ cell: posAt(e.attacker, e.step), won: e.winner });
    if (e.t === 'pass') {
      const from = last?.positions[e.from] ?? prev.players[e.from].pos;
      const to = e.result === 'intercepted' && e.by ? (last?.positions[e.by] ?? e.cell) : (e.landed ?? e.cell);
      o.passes!.push({ from, to, ok: e.result === 'ok' });
    }
    if (e.t === 'shot') {
      const from = last?.positions[e.shooter] ?? prev.players[e.shooter].pos;
      const team = prev.players[e.shooter].team;
      const gx = team === 'A' ? f.width - 1 : 0;
      const rows = goalRows(f);
      const zoneCol = e.zone % 3;
      const to = e.blockedBy ? (last?.positions[e.blockedBy] ?? from) : { x: gx, y: rows[Math.min(rows.length - 1, team === 'A' ? zoneCol : rows.length - 1 - zoneCol)] };
      const slot = prev.setup.slots.find((s) => s.id === e.shooter);
      const trail = slot?.trailId === 'rastro_faisca_azul';
      o.shots!.push({ from, to, goal: e.goal, trail });
    }
  }
  return o;
}

// ---------------------------------------------------------------------------
// Painel de planejamento (mini imagem numerada)
// ---------------------------------------------------------------------------

export function renderPlanning(state: MatchState, playerId: string, cells: Cell[], opts: { cell?: number; fullField?: boolean } = {}): Buffer {
  const f = state.setup.field;
  let crop: FieldOptions['crop'];
  if (!opts.fullField && cells.length) {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    crop = {
      x0: Math.max(0, Math.min(...xs) - 1),
      y0: Math.max(0, Math.min(...ys) - 1),
      x1: Math.min(f.width - 1, Math.max(...xs) + 1),
      y1: Math.min(f.height - 1, Math.max(...ys) + 1),
    };
  }
  return renderField(state, { crop, numbered: cells, highlight: playerId, cell: opts.cell ?? 56, hud: false, labels: true, showZones: true });
}

// ---------------------------------------------------------------------------
// GIF curto dos passos
// ---------------------------------------------------------------------------

export function renderStepsGif(prev: MatchState, r: TurnResult, opts: { cell?: number; delay?: number } = {}): Buffer {
  const cell = opts.cell ?? 40;
  const gif = GIFEncoder();
  const arrows = arrowsFromResult(prev, r);
  const frames = r.frames.length ? r.frames : [{ positions: Object.fromEntries(prev.order.map((id) => [id, prev.players[id].pos])), ball: prev.ball.pos, holder: prev.ball.holder }];
  const overlays = overlaysFromResult(prev, r);
  frames.forEach((fr, i) => {
    const isLast = i === frames.length - 1;
    const canvas = drawField(prev, { cell, frame: fr, hud: false, labels: false, arrows: i === 0 ? arrows : [], overlays: isLast ? overlays : undefined });
    const ctx = canvas.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 128);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay: isLast ? 1400 : i === 0 ? 700 : (opts.delay ?? 320) });
  });
  gif.finish();
  return Buffer.from(gif.bytes());
}

export { findSkill };
