import { MATCH_RULES } from '@ego/content';
import type { Team } from './types';

export interface Cell {
  x: number;
  y: number;
}

export interface FieldDims {
  width: number;
  height: number;
}

export const eq = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
export const key = (c: Cell) => `${c.x},${c.y}`;
export const cheb = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function inBounds(c: Cell, f: FieldDims): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < f.width && c.y < f.height;
}

export function neighbors8(c: Cell, f: FieldDims): Cell[] {
  const out: Cell[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const n = { x: c.x + dx, y: c.y + dy };
      if (inBounds(n, f)) out.push(n);
    }
  return out;
}

/** Casas dentro de um raio (Chebyshev), incluindo o centro. */
export function cellsWithin(c: Cell, r: number, f: FieldDims): Cell[] {
  const out: Cell[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (inBounds(n, f)) out.push(n);
    }
  return out;
}

/**
 * Caminho de passos de 1 casa (adjacência de 8) de `from` até `to`.
 * Usa a linha de Bresenham, que é 8-conectada e tem o tamanho da distância de Chebyshev.
 * Não inclui `from`.
 */
export function stepPath(from: Cell, to: Cell): Cell[] {
  return line(from, to).slice(1);
}

/** Linha de Bresenham entre duas casas (inclui as pontas). */
export function line(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let guard = 0;
  while (guard++ < 128) {
    out.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/** Menor distância (Chebyshev) de uma casa até qualquer casa de uma lista. */
export function distToCells(c: Cell, cells: Cell[]): number {
  let best = Infinity;
  for (const x of cells) best = Math.min(best, cheb(c, x));
  return best;
}

export function isStraight(from: Cell, to: Cell): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return dx === 0 || dy === 0 || dx === dy;
}

/** Coluna do gol que o time ATACA. Time A ataca para a direita. */
export function attackingGoalX(team: Team, f: FieldDims): number {
  return team === 'A' ? f.width - 1 : 0;
}

export function ownGoalX(team: Team, f: FieldDims): number {
  return team === 'A' ? 0 : f.width - 1;
}

export function goalRows(f: FieldDims): number[] {
  const mid = Math.floor((f.height - 1) / 2);
  const half = Math.floor(MATCH_RULES.goalWidth / 2);
  const rows: number[] = [];
  const start = f.height % 2 === 1 ? mid - half : mid - half + 1;
  for (let i = 0; i < MATCH_RULES.goalWidth; i++) rows.push(start + i);
  return rows;
}

export function goalCells(goalX: number, f: FieldDims): Cell[] {
  return goalRows(f).map((y) => ({ x: goalX, y }));
}

export function goalCenter(goalX: number, f: FieldDims): Cell {
  const rows = goalRows(f);
  return { x: goalX, y: rows[Math.floor(rows.length / 2)] };
}

/** Casas da área do goleiro de um time (a área do próprio gol). */
export function isInArea(c: Cell, defendingTeam: Team, f: FieldDims): boolean {
  const gx = ownGoalX(defendingTeam, f);
  const rows = goalRows(f);
  const minY = rows[0] - MATCH_RULES.areaExtraRows;
  const maxY = rows[rows.length - 1] + MATCH_RULES.areaExtraRows;
  const depthOk = defendingTeam === 'A' ? c.x < MATCH_RULES.areaDepth : c.x > gx - MATCH_RULES.areaDepth;
  return depthOk && c.y >= minY && c.y <= maxY;
}

export function areaCells(defendingTeam: Team, f: FieldDims): Cell[] {
  const out: Cell[] = [];
  for (let x = 0; x < f.width; x++) for (let y = 0; y < f.height; y++) if (isInArea({ x, y }, defendingTeam, f)) out.push({ x, y });
  return out;
}

/** Casa da borda mais próxima (para bola que saiu). */
export function nearestBorder(c: Cell, f: FieldDims): Cell {
  return { x: Math.min(f.width - 1, Math.max(0, c.x)), y: Math.min(f.height - 1, Math.max(0, c.y)) };
}

/** Linhas fora da faixa do gol (ângulo do chute). */
export function rowsOutsideGoal(c: Cell, f: FieldDims): number {
  const rows = goalRows(f);
  if (c.y < rows[0]) return rows[0] - c.y;
  if (c.y > rows[rows.length - 1]) return c.y - rows[rows.length - 1];
  return 0;
}
