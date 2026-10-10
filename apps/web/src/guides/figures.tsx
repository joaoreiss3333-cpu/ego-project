import type { ReactNode } from 'react';
import { COLORS, GACHA, RARITIES, RARITY_COLORS, RARITY_LABEL, type LineageDef } from '@ego/content';
import { cutRectPath } from '@ego/render/svg';
import { artUrl } from '@/lib/art';

/** Moldura de figura com legenda. */
export function Fig({ children, caption, step }: { children: ReactNode; caption?: ReactNode; step?: string }) {
  return (
    <figure className="fd">
      {step ? <div className="fd__step">{step}</div> : null}
      {children}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Sequência de quadros lado a lado (planejamento, revelação, resolução...). */
export function FigRow({ children }: { children: ReactNode }) {
  return <div className="fd-row">{children}</div>;
}

/** Gráfico de barras horizontal simples (fôlego, chances, custos). */
export function HBars({ title, rows, max, unit = '', color = COLORS.electric }: { title: string; rows: { label: string; value: number; color?: string; note?: string }[]; max?: number; unit?: string; color?: string }) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1);
  const rowH = 30;
  const labelW = 190;
  const w = 640;
  const h = rows.length * rowH + 8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title} className="g-chart">
      {rows.map((r, i) => {
        const y = i * rowH + 4;
        const bw = ((w - labelW - 90) * r.value) / m;
        return (
          <g key={i}>
            <text x={0} y={y + 18} className="g-chart__l">
              {r.label}
            </text>
            <rect x={labelW} y={y + 6} width={w - labelW - 90} height={14} fill={COLORS.line} />
            <rect x={labelW} y={y + 6} width={Math.max(2, bw)} height={14} fill={r.color ?? color} />
            <text x={w - 80} y={y + 18} className="g-chart__v">
              {r.value}
              {unit}
              {r.note ? ` ${r.note}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Curva (XP por nível etc.). */
export function Curve({ title, points, xLabel, yLabel, marks = [] }: { title: string; points: [number, number][]; xLabel: string; yLabel: string; marks?: number[] }) {
  const w = 640;
  const h = 260;
  const pad = { l: 64, r: 16, t: 14, b: 36 };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const sy = (y: number) => h - pad.b - (y / (y1 || 1)) * (h - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(y1 * k));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title} className="g-chart">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} stroke={COLORS.line} />
          <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" className="g-chart__t">
            {t.toLocaleString('pt-BR')}
          </text>
        </g>
      ))}
      {marks.map((m) => (
        <g key={m}>
          <line x1={sx(m)} x2={sx(m)} y1={pad.t} y2={h - pad.b} stroke={COLORS.electric} strokeDasharray="3 4" />
          <text x={sx(m)} y={h - pad.b + 16} textAnchor="middle" className="g-chart__t">
            {m}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={2.5} />
      <text x={w - pad.r} y={h - 6} textAnchor="end" className="g-chart__t">
        {xLabel}
      </text>
      <text x={pad.l} y={pad.t - 2} className="g-chart__t">
        {yLabel}
      </text>
    </svg>
  );
}

/** Faixas de raridade do giro (0 a 1). */
export function RateLadder() {
  const w = 640;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${w} 86`} role="img" aria-label="Faixas de raridade do número sorteado" className="g-chart">
      {RARITIES.map((r) => {
        const from = acc;
        acc += GACHA.rates[r];
        const x = from * w;
        const bw = Math.max(3, GACHA.rates[r] * w);
        return (
          <g key={r}>
            <rect x={x} y={18} width={bw} height={30} fill={RARITY_COLORS[r]} fillOpacity={0.3} stroke={COLORS.background} />
            <rect x={x} y={44} width={bw} height={4} fill={RARITY_COLORS[r]} />
            {GACHA.rates[r] > 0.05 ? (
              <text x={x + 2} y={64} className="g-chart__t" fill={RARITY_COLORS[r]} style={{ fill: RARITY_COLORS[r] }}>
                {from.toFixed(3)}
              </text>
            ) : null}
            {GACHA.rates[r] > 0.05 ? (
              <text x={x + 6} y={37} className="g-chart__l">
                {RARITY_LABEL[r]}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={w} y={80} textAnchor="end" className="g-chart__t">
        1.000
      </text>
      <text x={w} y={12} textAnchor="end" className="g-chart__t" style={{ fill: RARITY_COLORS.mitica }}>
        {RARITY_LABEL.lendaria} e {RARITY_LABEL.mitica} no fim da régua
      </text>
    </svg>
  );
}

/** Mini árvore estática (guia da árvore). */
export function MiniTree({ lineage }: { lineage: LineageDef }) {
  const N = 56;
  const COL = 150;
  const ROW = 110;
  const rows = Math.max(1, lineage.branches.length);
  const cols = 1 + Math.max(...lineage.branches.map((b) => b.nodes.length));
  const w = 30 + (cols - 1) * COL + N + 60;
  const h = 40 + (rows - 1) * ROW + N + 48;
  const pos = (col: number, row: number) => ({ x: 20 + col * COL, y: 30 + row * ROW });
  const start = pos(0, (rows - 1) / 2);
  const typeColor: Record<string, string> = { flow_start: '#FFFFFF', skill: COLORS.electric, evolution: COLORS.electricBright, awakening: COLORS.amber };
  const typeTag: Record<string, string> = { flow_start: 'FLOW', skill: 'HAB', evolution: 'EVO', awakening: 'DESP' };
  const nodes: ReactNode[] = [];
  const edges: ReactNode[] = [];
  const draw = (id: string, name: string, type: string, cost: number, skill: string | undefined, p: { x: number; y: number }) => {
    nodes.push(
      <g key={id}>
        <path d={cutRectPath(p.x, p.y, N, N, 12)} fill={COLORS.panel} />
        {skill ? <image href={artUrl.skill(lineage.id, skill)} x={p.x + 5} y={p.y + 5} width={N - 10} height={N - 10} opacity={type === 'evolution' ? 0.5 : 1} /> : null}
        <path d={cutRectPath(p.x, p.y, N, N, 12)} fill="none" stroke={typeColor[type]} strokeWidth={2.5} strokeDasharray={type === 'awakening' ? '6 4' : undefined} />
        <text x={p.x + N / 2} y={p.y + N + 18} textAnchor="middle" className="g-chart__l">
          {name.length > 18 ? `${name.slice(0, 17)}.` : name}
        </text>
        <text x={p.x + N / 2} y={p.y + N + 32} textAnchor="middle" className="g-chart__t">
          {typeTag[type]} {type === 'flow_start' ? '· GRÁTIS' : `· ${cost} PL`}
        </text>
      </g>,
    );
  };
  draw(lineage.startNode.id, lineage.startNode.name, lineage.startNode.type, 0, lineage.startNode.grantsSkill, start);
  lineage.branches.forEach((b, row) => {
    let prev = start;
    b.nodes.forEach((n, i) => {
      const p = pos(i + 1, row);
      const x1 = prev.x + N;
      const y1 = prev.y + N / 2;
      const y2 = p.y + N / 2;
      edges.push(<path key={`e${n.id}`} d={y1 === y2 ? `M${x1},${y1} H${p.x}` : `M${x1},${y1} H${x1 + 24} L${x1 + 24 + Math.abs(y2 - y1) * 0.6},${y2} H${p.x}`} fill="none" stroke={COLORS.line} strokeWidth={2.5} />);
      draw(n.id, n.name, n.type, n.cost, n.grantsSkill ?? n.evolves?.skillId, p);
      prev = p;
    });
    edges.push(
      <text key={`b${b.id}`} x={pos(1, row).x} y={pos(1, row).y - 10} className="g-chart__t" style={{ fill: COLORS.electricBright }}>
        RAMO / {b.name.toUpperCase()}
      </text>,
    );
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Árvore de ${lineage.name}`} className="g-chart">
      {edges}
      {nodes}
    </svg>
  );
}

/** Barra de Flow com os ganhos empilhados. */
export function FlowGauge({ gains, max }: { gains: { label: string; value: number }[]; max: number }) {
  const w = 640;
  let acc = 0;
  const palette = [COLORS.electric, COLORS.electricBright, '#FFFFFF', COLORS.amber, COLORS.success];
  return (
    <svg viewBox={`0 0 ${w} 96`} role="img" aria-label="Barra de Flow" className="g-chart">
      <rect x={0} y={20} width={w} height={26} fill={COLORS.line} />
      {gains.map((g, i) => {
        const x = (Math.min(acc, max) / max) * w;
        acc += g.value;
        const bw = (Math.min(g.value, Math.max(0, max - (acc - g.value))) / max) * w;
        return (
          <g key={g.label}>
            <rect x={x} y={20} width={Math.max(0, bw)} height={26} fill={palette[i % palette.length]} fillOpacity={0.85} stroke={COLORS.background} strokeWidth={2} />
            <text x={x + 4} y={64 + (i % 2) * 14} className="g-chart__t">
              +{g.value} {g.label}
            </text>
          </g>
        );
      })}
      <text x={w} y={14} textAnchor="end" className="g-chart__t">
        CHEIO EM {max}
      </text>
    </svg>
  );
}

/** Pista do treino físico. */
export function Track({ length, lanes, obstacles }: { length: number; lanes: number; obstacles: [number, number][] }) {
  const c = 34;
  const w = (length + 1) * c + 40;
  const h = lanes * c + 30;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Pista do treino físico" className="g-chart">
      {Array.from({ length: lanes }, (_, y) =>
        Array.from({ length: length + 1 }, (_, x) => (
          <rect key={`${x}-${y}`} x={20 + x * c} y={10 + y * c} width={c - 2} height={c - 2} fill={x === length ? 'rgba(43,214,123,0.18)' : '#0B1424'} stroke={COLORS.line} />
        )),
      )}
      {obstacles.map(([x, y], i) => (
        <path key={i} d={`M${20 + x * c + 6},${10 + y * c + c - 8} L${20 + x * c + c / 2 - 1},${10 + y * c + 6} L${20 + x * c + c - 8},${10 + y * c + c - 8} Z`} fill={COLORS.amber} />
      ))}
      <circle cx={20 + c / 2 - 1} cy={10 + c + c / 2 - 1} r={11} fill={COLORS.electric} stroke="#FFFFFF" strokeWidth={2} />
      <text x={20 + length * c + c / 2} y={h - 2} textAnchor="middle" className="g-chart__t">
        CHEGADA
      </text>
    </svg>
  );
}
