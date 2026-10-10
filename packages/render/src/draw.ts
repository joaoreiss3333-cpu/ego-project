import { GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fontsDir } from './assets';

let fontsReady = false;

/** Registra as fontes do projeto (uma vez por processo). */
export function ensureFonts() {
  if (fontsReady) return;
  try {
    for (const f of readdirSync(fontsDir()).filter((x) => x.endsWith('.ttf'))) GlobalFonts.registerFromPath(join(fontsDir(), f));
  } catch {
    /* sem fontes: o canvas usa as do sistema */
  }
  fontsReady = true;
}

export const FONT = {
  display: (px: number) => `${px}px Anton, "Barlow Condensed", Impact, sans-serif`,
  cond: (px: number, weight = 700) => `${weight} ${px}px "Barlow Condensed", Barlow, sans-serif`,
  body: (px: number, weight = 400) => `${weight} ${px}px Barlow, sans-serif`,
  mono: (px: number, weight = 400) => `${weight} ${px}px "IBM Plex Mono", monospace`,
};

export type Ctx = SKRSContext2D;
type CanvasTextAlign = 'left' | 'right' | 'center' | 'start' | 'end';
type CanvasTextBaseline = 'alphabetic' | 'top' | 'middle' | 'bottom' | 'hanging' | 'ideographic';

export function cutRect(ctx: Ctx, x: number, y: number, w: number, h: number, c: number) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

export function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'alphabetic') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(s, x, y);
}

/** Texto que encolhe até caber na largura. */
export function fitText(ctx: Ctx, s: string, x: number, y: number, maxW: number, fontAt: (px: number) => string, px: number, color: string, align: CanvasTextAlign = 'left') {
  let size = px;
  ctx.font = fontAt(size);
  while (size > 8 && ctx.measureText(s).width > maxW) {
    size -= 1;
    ctx.font = fontAt(size);
  }
  text(ctx, s, x, y, fontAt(size), color, align);
  return size;
}

/** Textura de grade (linguagem visual recorrente). */
export function gridTexture(ctx: Ctx, x: number, y: number, w: number, h: number, step: number, color: string, alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = x; gx <= x + w; gx += step) {
    ctx.moveTo(gx + 0.5, y);
    ctx.lineTo(gx + 0.5, y + h);
  }
  for (let gy = y; gy <= y + h; gy += step) {
    ctx.moveTo(x, gy + 0.5);
    ctx.lineTo(x + w, gy + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function isLightColor(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
}

/** Barra de progresso cortada. */
export function bar(ctx: Ctx, x: number, y: number, w: number, h: number, frac: number, color: string, back = '#1B2940') {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
}

export function arrowHead(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, size: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45));
  ctx.lineTo(x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}
