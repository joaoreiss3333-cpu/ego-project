import { createCanvas } from '@napi-rs/canvas';
import { COLORS } from '@ego/content';
import { goalRows, isInArea, type Cell, type turnos } from '@ego/engine';
import { FONT, arrowHead, ensureFonts, text, withAlpha, type Ctx } from './draw';

export interface TurnosFieldOptions {
  /** Tamanho da casa em pixels. */
  cell?: number;
  /** Jogador da vez (anel destacado). */
  actor?: string | null;
  /** Casas numeradas (painel): a ordem define o número. */
  numbered?: Cell[];
  /** Casas realçadas (alvos possíveis). */
  targets?: Cell[];
  /** Casa escolhida (confirmação). */
  marked?: Cell | null;
  /** Último lance: setas e linhas. */
  events?: turnos.TEvent[];
  /** Texto no canto superior direito. */
  hudRight?: string;
}

const FIELD = { base: '#0A171C', stripe: '#0C1C22', grid: '#1A3440', line: 'rgba(255,255,255,0.55)', area: withAlpha(COLORS.electric, 0.55) };
const TEAM = { A: COLORS.teamA, B: COLORS.teamB } as const;
const PASS_COLOR = { curto: '#4C8DFF', longo: '#B45CFF', profundidade: '#2BD67B', cruzamento: '#FFB020' } as const;

interface Geo {
  s: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const cc = (g: Geo, c: Cell) => ({ x: g.ox + c.x * g.s + g.s / 2, y: g.oy + c.y * g.s + g.s / 2 });

function drawPitch(ctx: Ctx, st: turnos.TState, g: Geo) {
  const f = st.setup.field;
  for (let x = 0; x < f.width; x++) {
    ctx.fillStyle = x % 2 === 0 ? FIELD.base : FIELD.stripe;
    ctx.fillRect(g.ox + x * g.s, g.oy, g.s, f.height * g.s);
  }
  for (const team of ['A', 'B'] as const)
    for (let x = 0; x < f.width; x++)
      for (let y = 0; y < f.height; y++)
        if (isInArea({ x, y }, team, f)) {
          ctx.fillStyle = withAlpha(COLORS.electric, 0.07);
          ctx.fillRect(g.ox + x * g.s, g.oy + y * g.s, g.s, g.s);
        }
  ctx.strokeStyle = FIELD.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= f.width; i++) {
    ctx.moveTo(g.ox + i * g.s + 0.5, g.oy);
    ctx.lineTo(g.ox + i * g.s + 0.5, g.oy + f.height * g.s);
  }
  for (let j = 0; j <= f.height; j++) {
    ctx.moveTo(g.ox, g.oy + j * g.s + 0.5);
    ctx.lineTo(g.ox + f.width * g.s, g.oy + j * g.s + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = FIELD.line;
  ctx.lineWidth = 2;
  const px = g.ox + (f.width / 2) * g.s;
  ctx.beginPath();
  ctx.moveTo(px, g.oy);
  ctx.lineTo(px, g.oy + f.height * g.s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, g.oy + (f.height / 2) * g.s, g.s * 1.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(g.ox + 1, g.oy + 1, f.width * g.s - 2, f.height * g.s - 2);
  // contorno das áreas
  const rows = goalRows(f);
  const minY = rows[0] - 1;
  const maxY = rows[rows.length - 1] + 1;
  ctx.strokeStyle = FIELD.area;
  for (const [x0] of [[0], [f.width - 2]]) ctx.strokeRect(g.ox + x0 * g.s, g.oy + minY * g.s, 2 * g.s, (maxY - minY + 1) * g.s);
  // gols
  for (const gx of [0, f.width - 1])
    for (const y of rows) {
      const c = cc(g, { x: gx, y });
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(c.x - g.s / 2, c.y - g.s / 2, g.s, g.s);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(gx === 0 ? c.x - g.s / 2 : c.x + g.s / 2 - 4, c.y - g.s / 2, 4, g.s);
    }
}

function drawPlayer(ctx: Ctx, st: turnos.TState, g: Geo, id: string, actor: string | null) {
  const p = st.players[id];
  const slot = st.setup.slots.find((x) => x.id === id)!;
  const c = cc(g, p.pos);
  const r = g.s * 0.36;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(c.x + 2, c.y + 3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TEAM[p.team];
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (p.isKeeper) {
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const light = p.team === 'B';
  text(ctx, String(slot.number), c.x, c.y + 1, FONT.cond(Math.round(g.s * 0.36), 800), light ? '#0A171C' : '#FFFFFF', 'center', 'middle');
  if (actor === id) {
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // cartões e queda
  if (p.yellow > 0 || p.offUntil >= st.round) {
    ctx.fillStyle = p.offUntil >= st.round ? COLORS.alert : '#FFD400';
    ctx.fillRect(c.x + r * 0.55, c.y - r * 1.15, g.s * 0.14, g.s * 0.2);
  }
  if (p.fallen) text(ctx, '×', c.x - r, c.y - r * 0.9, FONT.cond(Math.round(g.s * 0.34), 800), COLORS.alert, 'center', 'middle');
  // identificação (A1, B2...) embaixo
  text(ctx, id, c.x, c.y + r + g.s * 0.14, FONT.mono(Math.round(g.s * 0.2), 600), COLORS.muted, 'center', 'middle');
}

function drawBall(ctx: Ctx, st: turnos.TState, g: Geo) {
  const holder = st.ball.holder ? st.players[st.ball.holder] : null;
  const c = cc(g, st.ball.pos);
  const off = holder ? g.s * 0.28 : 0;
  const x = c.x + off;
  const y = c.y + off;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0A171C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, g.s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawEvents(ctx: Ctx, g: Geo, events: turnos.TEvent[]) {
  ctx.lineCap = 'round';
  for (const e of events) {
    if (e.t === 'move') {
      const a = cc(g, e.from);
      const b = cc(g, e.to);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      arrowHead(ctx, a.x, a.y, b.x, b.y, 10);
    } else if (e.t === 'pass') {
      const a = cc(g, e.from);
      const b = cc(g, e.end);
      const col = PASS_COLOR[e.type];
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 3;
      ctx.setLineDash(e.type === 'longo' || e.type === 'cruzamento' ? [10, 8] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      arrowHead(ctx, a.x, a.y, b.x, b.y, 12);
    } else if (e.t === 'shot') {
      const a = cc(g, e.from);
      const gx = e.from.x < 5 ? 0 : g.w - 1;
      const b = cc(g, { x: gx, y: Math.round((g.h - 1) / 2) + (e.corner - 1) });
      ctx.strokeStyle = e.result === 'gol' ? COLORS.success : COLORS.alert;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      arrowHead(ctx, a.x, a.y, b.x, b.y, 13);
    } else if (e.t === 'duel') {
      const c = cc(g, e.cell);
      ctx.strokeStyle = e.result === 'win' ? COLORS.success : e.result === 'lose' ? COLORS.alert : COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, g.s * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.t === 'foul') {
      /* a falta é narrada no texto */
    }
  }
}

function drawCells(ctx: Ctx, g: Geo, cells: Cell[], numbered: boolean, color: string) {
  cells.forEach((c, i) => {
    const x = g.ox + c.x * g.s;
    const y = g.oy + c.y * g.s;
    ctx.fillStyle = withAlpha(color, 0.22);
    ctx.fillRect(x + 1, y + 1, g.s - 2, g.s - 2);
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, g.s - 4, g.s - 4);
    if (numbered) {
      const r = g.s * 0.2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + r + 3, y + r + 3, r, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(i + 1), x + r + 3, y + r + 4, FONT.cond(Math.round(g.s * 0.26), 800), '#0A171C', 'center', 'middle');
    }
  });
}

export function renderTurnosField(st: turnos.TState, o: TurnosFieldOptions = {}): Buffer {
  ensureFonts();
  const f = st.setup.field;
  const s = o.cell ?? Math.max(40, Math.min(64, Math.floor(960 / f.width)));
  const pad = 14;
  const top = 34;
  const g: Geo = { s, ox: pad, oy: top, w: f.width, h: f.height };
  const width = f.width * s + pad * 2;
  const height = f.height * s + top + pad;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  text(ctx, `RODADA ${st.roundInHalf} · ${st.half}º TEMPO`, pad, 22, FONT.cond(18, 700), COLORS.muted);
  if (o.hudRight) text(ctx, o.hudRight, width - pad, 22, FONT.cond(18, 700), COLORS.muted, 'right');
  drawPitch(ctx, st, g);
  if (o.events?.length) drawEvents(ctx, g, o.events);
  if (o.targets?.length) drawCells(ctx, g, o.targets, false, COLORS.amber);
  if (o.numbered?.length) drawCells(ctx, g, o.numbered, true, COLORS.electricBright);
  if (o.marked) drawCells(ctx, g, [o.marked], false, COLORS.success);
  for (const id of st.order) if (st.players[id].offUntil < st.round) drawPlayer(ctx, st, g, id, o.actor ?? null);
  drawBall(ctx, st, g);
  return canvas.toBuffer('image/png');
}
