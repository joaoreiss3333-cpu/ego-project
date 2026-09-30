import type { ReactNode } from 'react';
import { COLORS, FIELD_SIZES, type MatchMode } from '@ego/content';
import { goalRows, isInArea } from '@ego/engine';

/** Tamanho da casa em unidades do SVG. */
export const CELL = 40;

export type Team = 'A' | 'B';
export type Pt = [number, number];

export interface FieldToken {
  x: number;
  y: number;
  team: Team;
  n?: string | number;
  ball?: boolean;
  keeper?: boolean;
  ghost?: boolean;
  tag?: string;
  /** Anel de destaque (quem está sendo explicado). */
  focus?: boolean;
}

export type ArrowKind = 'move' | 'pass' | 'shot' | 'dribble' | 'blocked' | 'reveal' | 'late';

export interface FieldArrow {
  from: Pt;
  to: Pt;
  via?: Pt[];
  kind?: ArrowKind;
  team?: Team;
  label?: string;
}

export type Tone = 'blue' | 'red' | 'amber' | 'white' | 'muted' | 'green';

export interface FieldMark {
  x: number;
  y: number;
  tone?: Tone;
  label?: string;
  /** Contorno tracejado em vez de preenchido. */
  outline?: boolean;
}

export interface FieldZone {
  x: number;
  y: number;
  r: number;
  team?: Team;
}

export interface Crop {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const TONE: Record<Tone, string> = {
  blue: COLORS.electric,
  red: COLORS.alert,
  amber: COLORS.amber,
  white: '#FFFFFF',
  muted: COLORS.muted,
  green: COLORS.success,
};

export const teamFill = (t: Team) => (t === 'A' ? COLORS.teamA : COLORS.teamB);
export const teamInk = (t: Team) => (t === 'A' ? '#FFFFFF' : COLORS.background);

const c = (v: number) => (v + 0.5) * CELL;

/** Grade, meio-campo, áreas e gols. Reaproveitado pelo replay. */
export function FieldBase({ width, height, crop, areas = true, goals = true }: { width: number; height: number; crop?: Crop; areas?: boolean; goals?: boolean }) {
  const f = { width, height };
  const rows = goalRows(f);
  const x0 = crop?.x0 ?? 0;
  const x1 = crop?.x1 ?? width - 1;
  const y0 = crop?.y0 ?? 0;
  const y1 = crop?.y1 ?? height - 1;
  const lines: ReactNode[] = [];
  for (let x = x0; x <= x1 + 1; x++) lines.push(<line key={`v${x}`} x1={x * CELL} y1={y0 * CELL} x2={x * CELL} y2={(y1 + 1) * CELL} />);
  for (let y = y0; y <= y1 + 1; y++) lines.push(<line key={`h${y}`} x1={x0 * CELL} y1={y * CELL} x2={(x1 + 1) * CELL} y2={y * CELL} />);
  const areaRect = (team: Team) => {
    const cells: Pt[] = [];
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) if (isInArea({ x, y }, team, f)) cells.push([x, y]);
    const xs = cells.map((p) => p[0]);
    const ys = cells.map((p) => p[1]);
    const ax = Math.min(...xs);
    const ay = Math.min(...ys);
    return <rect key={team} className="fd-area" x={ax * CELL} y={ay * CELL} width={(Math.max(...xs) - ax + 1) * CELL} height={(Math.max(...ys) - ay + 1) * CELL} />;
  };
  const midX = (width / 2) * CELL;
  return (
    <g>
      <rect className="fd-pitch" x={x0 * CELL} y={y0 * CELL} width={(x1 - x0 + 1) * CELL} height={(y1 - y0 + 1) * CELL} />
      {areas ? [areaRect('A'), areaRect('B')] : null}
      <g className="fd-grid">{lines}</g>
      <line className="fd-mid" x1={midX} y1={y0 * CELL} x2={midX} y2={(y1 + 1) * CELL} />
      <circle className="fd-mid" cx={midX} cy={(height / 2) * CELL} r={CELL * 1.4} />
      <rect className="fd-border" x={0} y={0} width={width * CELL} height={height * CELL} />
      {goals ? (
        <>
          <rect className="fd-goal" x={-CELL * 0.4} y={rows[0] * CELL} width={CELL * 0.4} height={rows.length * CELL} />
          <rect className="fd-goal" x={width * CELL} y={rows[0] * CELL} width={CELL * 0.4} height={rows.length * CELL} />
        </>
      ) : null}
    </g>
  );
}

export function Token({ t, cx, cy }: { t: FieldToken; cx?: number; cy?: number }) {
  const x = cx ?? c(t.x);
  const y = cy ?? c(t.y);
  const r = CELL * 0.34;
  return (
    <g className={`fd-token${t.ghost ? ' is-ghost' : ''}`}>
      {t.focus ? <circle cx={x} cy={y} r={r + 7} fill="none" stroke={COLORS.electricBright} strokeWidth={2} strokeDasharray="4 3" /> : null}
      <circle cx={x} cy={y} r={r + 3} fill="none" stroke={t.team === 'A' ? COLORS.electricBright : '#FFFFFF'} strokeOpacity={0.6} strokeWidth={1.5} />
      <circle cx={x} cy={y} r={r} fill={t.ghost ? 'none' : teamFill(t.team)} stroke={t.ghost ? teamFill(t.team) : 'none'} strokeDasharray={t.ghost ? '3 3' : undefined} strokeWidth={t.ghost ? 1.5 : 0} />
      {t.keeper ? <rect x={x - r * 0.62} y={y - r * 0.62} width={r * 1.24} height={r * 1.24} fill="none" stroke={t.team === 'A' ? '#FFFFFF' : COLORS.background} strokeOpacity={0.55} /> : null}
      {t.n !== undefined && !t.ghost ? (
        <text x={x} y={y + 5} textAnchor="middle" className="fd-num" fill={teamInk(t.team)}>
          {t.n}
        </text>
      ) : null}
      {t.ball ? <circle cx={x + r * 0.95} cy={y + r * 0.95} r={6} fill="#FFFFFF" stroke={COLORS.background} strokeWidth={2} /> : null}
      {t.tag ? (
        <text x={x} y={y - r - 7} textAnchor="middle" className="fd-tag">
          {t.tag}
        </text>
      ) : null}
    </g>
  );
}

function arrowHead(p: Pt, q: Pt, size: number): string {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = q[0] - ux * size;
  const by = q[1] - uy * size;
  const px = -uy * size * 0.55;
  const py = ux * size * 0.55;
  return `${q[0]},${q[1]} ${bx + px},${by + py} ${bx - px},${by - py}`;
}

export const ARROW_COLOR: Record<ArrowKind, string> = {
  move: COLORS.electricBright,
  pass: '#FFFFFF',
  shot: COLORS.amber,
  dribble: COLORS.electricBright,
  blocked: COLORS.muted,
  reveal: COLORS.muted,
  late: COLORS.success,
};

export function Arrow({ a, pts: raw }: { a: FieldArrow; pts?: Pt[] }) {
  const kind = a.kind ?? 'move';
  const pts: Pt[] = raw ?? [a.from, ...(a.via ?? []), a.to].map(([x, y]) => [c(x), c(y)] as Pt);
  // encurta o fim para não cobrir o token de destino
  const n = pts.length;
  const [px, py] = pts[n - 2];
  const [qx, qy] = pts[n - 1];
  const len = Math.hypot(qx - px, qy - py) || 1;
  const trim = Math.min(len * 0.45, CELL * 0.36);
  const end: Pt = [qx - ((qx - px) / len) * trim, qy - ((qy - py) / len) * trim];
  // começa na borda do token de origem, não no centro
  const [sx, sy] = pts[0];
  const [tx, ty] = n > 2 ? pts[1] : end;
  const slen = Math.hypot(tx - sx, ty - sy) || 1;
  const strim = slen > CELL * 0.7 ? CELL * 0.38 : 0;
  const start: Pt = [sx + ((tx - sx) / slen) * strim, sy + ((ty - sy) / slen) * strim];
  const drawn = [start, ...pts.slice(1, n - 1), end];
  const color = kind === 'move' && a.team === 'B' ? '#FFFFFF' : ARROW_COLOR[kind];
  const d = drawn.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const width = kind === 'shot' ? 3.5 : 2.5;
  const dash = kind === 'pass' ? '7 5' : kind === 'reveal' ? '2 5' : kind === 'late' ? '10 4' : undefined;
  const mid = drawn[Math.floor((drawn.length - 1) / 2)];
  const mid2 = drawn[Math.min(drawn.length - 1, Math.floor((drawn.length - 1) / 2) + 1)];
  return (
    <g className={`fd-arrow fd-arrow--${kind}`}>
      <path d={d} fill="none" stroke={COLORS.background} strokeWidth={width + 4} strokeOpacity={0.6} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="square" />
      {kind === 'blocked' ? (
        <g stroke={COLORS.alert} strokeWidth={3}>
          <line x1={end[0] - 6} y1={end[1] - 6} x2={end[0] + 6} y2={end[1] + 6} />
          <line x1={end[0] - 6} y1={end[1] + 6} x2={end[0] + 6} y2={end[1] - 6} />
        </g>
      ) : (
        <polygon points={arrowHead(drawn[drawn.length - 2], end, kind === 'shot' ? 13 : 11)} fill={color} />
      )}
      {a.label ? (
        <text x={(mid[0] + mid2[0]) / 2} y={(mid[1] + mid2[1]) / 2 - 8} textAnchor="middle" className="fd-alabel">
          {a.label}
        </text>
      ) : null}
    </g>
  );
}

export function Mark({ m }: { m: FieldMark }) {
  const color = TONE[m.tone ?? 'blue'];
  return (
    <g>
      <rect
        x={m.x * CELL + 2}
        y={m.y * CELL + 2}
        width={CELL - 4}
        height={CELL - 4}
        fill={m.outline ? 'none' : color}
        fillOpacity={m.outline ? 0 : 0.2}
        stroke={color}
        strokeOpacity={0.9}
        strokeWidth={1.5}
        strokeDasharray={m.outline ? '4 3' : undefined}
      />
      {m.label ? (
        <text x={c(m.x)} y={c(m.y) + 4} textAnchor="middle" className="fd-mlabel" fill={color}>
          {m.label}
        </text>
      ) : null}
    </g>
  );
}

export function Zone({ z }: { z: FieldZone }) {
  const color = z.team === 'A' ? COLORS.electric : z.team === 'B' ? '#FFFFFF' : COLORS.amber;
  const x = (z.x - z.r) * CELL;
  const y = (z.y - z.r) * CELL;
  const s = (z.r * 2 + 1) * CELL;
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={s - 2} height={s - 2} fill={color} fillOpacity={0.08} stroke={color} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 4" />
    </g>
  );
}

export interface FieldDiagramProps {
  title: string;
  mode?: MatchMode;
  size?: { width: number; height: number };
  crop?: Crop;
  tokens?: FieldToken[];
  arrows?: FieldArrow[];
  marks?: FieldMark[];
  zones?: FieldZone[];
  caption?: ReactNode;
  step?: string;
  areas?: boolean;
  /** Linhas de gol destacadas (faixa do chute). */
  goalBand?: Team;
  className?: string;
}

/** Diagrama do campo em grade (guias e landing). Puro SVG, sem estado. */
export function FieldDiagram({ title, mode = '3v3', size, crop, tokens = [], arrows = [], marks = [], zones = [], caption, step, areas = true, goalBand, className }: FieldDiagramProps) {
  const dims = size ?? FIELD_SIZES[mode];
  const x0 = crop?.x0 ?? 0;
  const x1 = crop?.x1 ?? dims.width - 1;
  const y0 = crop?.y0 ?? 0;
  const y1 = crop?.y1 ?? dims.height - 1;
  const padL = x0 === 0 ? CELL * 0.6 : 6;
  const padR = x1 === dims.width - 1 ? CELL * 0.6 : 6;
  const vb = `${x0 * CELL - padL} ${y0 * CELL - 18} ${(x1 - x0 + 1) * CELL + padL + padR} ${(y1 - y0 + 1) * CELL + 30}`;
  const rows = goalRows(dims);
  return (
    <figure className={`fd${className ? ` ${className}` : ''}`}>
      {step ? <div className="fd__step">{step}</div> : null}
      <svg viewBox={vb} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
        <FieldBase width={dims.width} height={dims.height} crop={crop} areas={areas} />
        {goalBand
          ? rows.map((y) => <Mark key={`gb${y}`} m={{ x: goalBand === 'A' ? 0 : dims.width - 1, y, tone: 'amber', outline: true }} />)
          : null}
        {zones.map((z, i) => (
          <Zone key={`z${i}`} z={z} />
        ))}
        {marks.map((m, i) => (
          <Mark key={`m${i}`} m={m} />
        ))}
        {tokens.filter((t) => t.ghost).map((t, i) => (
          <Token key={`g${i}`} t={t} />
        ))}
        {arrows.map((a, i) => (
          <Arrow key={`a${i}`} a={a} />
        ))}
        {tokens.filter((t) => !t.ghost).map((t, i) => (
          <Token key={`t${i}`} t={t} />
        ))}
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Legenda padrão das setas. */
export function ArrowLegend({ kinds }: { kinds: ArrowKind[] }) {
  const LABEL: Record<ArrowKind, string> = {
    move: 'Movimento',
    pass: 'Passe',
    shot: 'Chute',
    dribble: 'Drible',
    blocked: 'Parou / cortado',
    reveal: 'Revelado',
    late: 'Anda por último',
  };
  return (
    <ul className="fd-legend">
      {kinds.map((k) => (
        <li key={k}>
          <svg viewBox="0 0 40 10" width={40} height={10} aria-hidden>
            <line x1={0} y1={5} x2={40} y2={5} stroke={ARROW_COLOR[k]} strokeWidth={k === 'shot' ? 3.5 : 2.5} strokeDasharray={k === 'pass' ? '7 5' : k === 'reveal' ? '2 5' : k === 'late' ? '10 4' : undefined} />
          </svg>
          {LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
