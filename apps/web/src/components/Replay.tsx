'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACTION_LABEL, COLORS, GOAL_ZONE_LABEL, READ_GUESS_LABEL, findSkill } from '@ego/content';
import { goalRows, replay, type MatchEvent, type MatchSetup, type PlanMap } from '@ego/engine';
import { isLight } from '@ego/render/svg';
import { Arrow, CELL, FieldBase, type ArrowKind, type Pt } from './field/FieldDiagram';

const STEP_MS = 520;

const DUEL_LABEL: Record<string, string> = {
  drible: 'drible',
  protecao: 'proteção',
  passe: 'passe',
  conducao: 'condução',
  cobertura: 'cobertura',
  chute: 'chute',
};
const PASS_RESULT: Record<string, string> = {
  ok: 'chegou',
  intercepted: 'interceptado',
  astray: 'saiu torto',
  loose: 'ficou solto',
  out: 'saiu do campo',
};

export function Replay({ setup, turns, mySlot }: { setup: MatchSetup; turns: PlanMap[]; mySlot: string | null }) {
  const run = useMemo(() => {
    try {
      return replay(setup, turns);
    } catch {
      return null;
    }
  }, [setup, turns]);

  const timeline = useMemo(
    () => (run ? run.results.flatMap((r, ti) => r.frames.map((_, fi) => ({ ti, fi, last: fi === r.frames.length - 1 }))) : []),
    [run],
  );
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (idx >= timeline.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIdx((i) => Math.min(timeline.length - 1, i + 1)), timeline[idx]?.last ? STEP_MS * 2.2 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, idx, timeline]);

  const turnStart = useCallback((ti: number) => Math.max(0, timeline.findIndex((e) => e.ti === ti)), [timeline]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') setIdx((i) => Math.min(timeline.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timeline.length]);

  if (!run || !timeline.length) {
    return <p className="flash flash--err">Não foi possível reproduzir esta partida (dados incompletos).</p>;
  }

  const { states, results } = run;
  const cur = timeline[Math.min(idx, timeline.length - 1)];
  const res = results[cur.ti];
  const before = states[cur.ti];
  const after = states[cur.ti + 1] ?? before;
  const frame = res.frames[cur.fi];
  const score = cur.last ? after.score : before.score;
  const f = setup.field;
  const name = (id: string | null | undefined) => setup.slots.find((s) => s.id === id)?.name ?? (id ? id : 'ninguém');
  const px = (x: number) => (x + 0.5) * CELL;
  const goalY = px(goalRows(f)[Math.floor(goalRows(f).length / 2)]);

  // setas do movimento do lance
  const arrows: { key: string; pts: Pt[]; kind: ArrowKind; team: 'A' | 'B' }[] = [];
  for (const id of before.order) {
    const path = res.paths[id];
    if (!path?.length) continue;
    const start = before.players[id].pos;
    const pts: Pt[] = [[px(start.x), px(start.y)], ...path.map((c) => [px(c.x), px(c.y)] as Pt)];
    const plan = res.plans[id];
    arrows.push({ key: id, pts, kind: plan?.action === 'driblar' ? 'dribble' : 'move', team: before.players[id].team });
  }
  // passe e chute aparecem no fim do lance (acontecem depois do movimento)
  const ballLines: { key: string; pts: Pt[]; kind: ArrowKind; label?: string }[] = [];
  if (cur.last) {
    res.events.forEach((e, i) => {
      if (e.t === 'pass') {
        const from = frame.positions[e.from];
        const endCell = e.result === 'intercepted' && e.by ? frame.positions[e.by] : (e.landed ?? e.cell);
        if (from && endCell) ballLines.push({ key: `p${i}`, pts: [[px(from.x), px(from.y)], [px(endCell.x), px(endCell.y)]], kind: e.result === 'intercepted' ? 'blocked' : 'pass', label: PASS_RESULT[e.result] });
      }
      if (e.t === 'shot') {
        const from = frame.positions[e.shooter];
        const team = setup.slots.find((s) => s.id === e.shooter)?.team ?? 'A';
        const gx = team === 'A' ? f.width * CELL + CELL * 0.2 : -CELL * 0.2;
        if (from) {
          const to: Pt = e.blockedBy && frame.positions[e.blockedBy] ? [px(frame.positions[e.blockedBy].x), px(frame.positions[e.blockedBy].y)] : [gx, goalY];
          ballLines.push({ key: `s${i}`, pts: [[px(from.x), px(from.y)], to], kind: e.blockedBy ? 'blocked' : 'shot', label: e.goal ? 'GOL' : e.blockedBy ? 'bloqueado' : 'defendido' });
        }
      }
    });
  }
  const goal = cur.last ? res.events.find((e): e is Extract<MatchEvent, { t: 'goal' }> => e.t === 'goal') : undefined;
  const holderPos = frame.holder ? frame.positions[frame.holder] : null;
  const ball = holderPos ? { x: px(holderPos.x) + CELL * 0.3, y: px(holderPos.y) + CELL * 0.3 } : { x: px(frame.ball.x), y: px(frame.ball.y) };
  const vb = `${-CELL * 0.7} ${-CELL * 0.4} ${(f.width + 1.4) * CELL} ${(f.height + 0.8) * CELL}`;

  return (
    <div className="replay">
      <div className="replay__stage">
        <div className="replay__hud">
          <div className="score" aria-label={`Placar ${score.A} a ${score.B}`}>
            <span className="score__team">Time A</span>
            <span style={{ color: COLORS.teamA }}>{score.A}</span>
            <span className="score__sep">/</span>
            <span>{score.B}</span>
            <span className="score__team">Time B</span>
          </div>
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">
              {before.half}º tempo · lance {before.turnInHalf}/{setup.turnsPerHalf}
            </span>
            <span className="t-mono muted" style={{ fontSize: 12 }}>
              {cur.fi === 0 ? 'Revelação' : cur.last ? 'Ação de bola' : `Passo ${cur.fi}`} · lance global {cur.ti + 1}/{results.length}
            </span>
          </div>
        </div>
        <svg viewBox={vb} role="img" aria-label={`Campo no lance ${cur.ti + 1}`}>
          <FieldBase width={f.width} height={f.height} />
          <g opacity={cur.fi === 0 ? 1 : 0.55}>
            {arrows.map((a) => (
              <Arrow key={a.key} a={{ from: [0, 0], to: [0, 0], kind: a.kind, team: a.team }} pts={a.pts} />
            ))}
          </g>
          {ballLines.map((l) => (
            <Arrow key={l.key} a={{ from: [0, 0], to: [0, 0], kind: l.kind, label: l.label }} pts={l.pts} />
          ))}
          {before.order.map((id) => {
            const slot = setup.slots.find((s) => s.id === id)!;
            const p = frame.positions[id];
            const r = CELL * 0.34;
            const light = isLight(slot.color);
            return (
              <g key={id} className="rp-token" style={{ transform: `translate(${px(p.x)}px, ${px(p.y)}px)` }}>
                {id === mySlot ? <circle r={r + 8} fill="none" stroke={COLORS.electricBright} strokeWidth={2} strokeDasharray="4 3" /> : null}
                <circle r={r + 3} fill="none" stroke={slot.team === 'A' ? COLORS.electricBright : '#FFFFFF'} strokeWidth={2} />
                <circle r={r} fill={slot.color} />
                {slot.isKeeper ? <rect x={-r * 0.62} y={-r * 0.62} width={r * 1.24} height={r * 1.24} fill="none" stroke={light ? '#000' : '#fff'} strokeOpacity={0.5} /> : null}
                <text y={5} textAnchor="middle" className="fd-num" fill={light ? COLORS.background : '#FFFFFF'}>
                  {slot.number}
                </text>
                <text y={-r - 8} textAnchor="middle" className="fd-tag rp-tag">
                  {shortName(slot.name)}
                </text>
              </g>
            );
          })}
          <g className="rp-ball" style={{ transform: `translate(${ball.x}px, ${ball.y}px)` }}>
            <circle r={7} fill="#FFFFFF" stroke={COLORS.background} strokeWidth={2.5} />
          </g>
          {goal ? (
            <g>
              <rect x={f.width * CELL * 0.5 - 90} y={f.height * CELL * 0.5 - 34} width={180} height={68} fill={COLORS.background} fillOpacity={0.85} stroke={COLORS.electric} strokeWidth={2} />
              <text x={f.width * CELL * 0.5} y={f.height * CELL * 0.5 + 18} textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize={52} fill="#FFFFFF">
                GOL
              </text>
            </g>
          ) : null}
        </svg>
        <div className="controls">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIdx(turnStart(Math.max(0, cur.ti - 1)))} aria-label="Lance anterior">
            Lance -
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIdx((i) => Math.max(0, i - 1))} aria-label="Passo anterior">
            Passo -
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              if (idx >= timeline.length - 1) setIdx(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? 'Pausar' : idx >= timeline.length - 1 ? 'Rever' : 'Reproduzir'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIdx((i) => Math.min(timeline.length - 1, i + 1))} aria-label="Próximo passo">
            Passo +
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIdx(turnStart(Math.min(results.length - 1, cur.ti + 1)))} aria-label="Próximo lance">
            Lance +
          </button>
          <span className="t-mono muted" style={{ fontSize: 11 }}>
            <span className="kbd">Espaço</span> reproduz · <span className="kbd">setas</span> passo a passo
          </span>
        </div>
        <label className="stack stack--tight" style={{ marginTop: 12 }}>
          <span className="label">Lance {cur.ti + 1} de {results.length}</span>
          <input
            className="scrub"
            type="range"
            min={0}
            max={results.length - 1}
            value={cur.ti}
            onChange={(e) => {
              setPlaying(false);
              setIdx(turnStart(Number(e.target.value)));
            }}
          />
        </label>
      </div>

      <aside className="stack">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Narração</h2>
            <span className="panel__code">LANCE {cur.ti + 1}</span>
          </div>
          <ul className="log">
            {res.log.map((l, i) => (
              <li key={i} className={i === 0 ? 'is-key' : undefined}>
                {l}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Eventos</h2>
            <span className="panel__code">ROLAGENS</span>
          </div>
          <div className="events">
            {res.events.map((e, i) => {
              const t = eventText(e, name);
              return t ? (
                <div key={i}>
                  <span>{t[0]}</span>
                  <span className="accent">{t[1]}</span>
                </div>
              ) : null;
            })}
          </div>
        </section>
        <details className="panel plans">
          <summary className="panel__title">Planos revelados</summary>
          <div className="events" style={{ marginTop: 10 }}>
            {before.order.map((id) => {
              const p = res.plans[id];
              if (!p) return null;
              const sk = p.skill ? findSkill(p.skill)?.name : null;
              return (
                <div key={id}>
                  <span>{name(id)}</span>
                  <span>
                    {ACTION_LABEL[p.action]}
                    {p.readGuess ? ` (${READ_GUESS_LABEL[p.readGuess]})` : ''}
                    {sk ? ` + ${sk}` : ''}
                    {p.useFlow ? ' + Flow' : ''}
                    {p.sprint ? ' + sprint' : ''}
                    {p.auto ? ' · IA' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      </aside>
    </div>
  );
}

/** Nome curto para a etiqueta do token (o nome inteiro está na ficha). */
function shortName(n: string): string {
  const first = n.trim().split(' ')[0] || n;
  return first.length > 9 ? `${first.slice(0, 8)}.` : first;
}

function eventText(e: MatchEvent, name: (id: string | null | undefined) => string): [string, string] | null {
  switch (e.t) {
    case 'duel':
      return [`Duelo de ${DUEL_LABEL[e.kind] ?? e.kind}: ${name(e.attacker)} x ${name(e.defender)}`, `${e.atk} x ${e.def} · ${e.winner === 'atk' ? name(e.attacker) : name(e.defender)}`];
    case 'pass':
      return [`Passe de ${name(e.from)}${e.to ? ` para ${name(e.to)}` : ' no espaço'}`, `${e.roll} · ${PASS_RESULT[e.result] ?? e.result}${e.by ? ` (${name(e.by)})` : ''}`];
    case 'shot':
      return [
        `Chute de ${name(e.shooter)} · ${GOAL_ZONE_LABEL[e.zone]}${e.oneTouch ? ' · de primeira' : ''}`,
        `${e.roll} x ${e.keeperRoll > -50 ? e.keeperRoll : '-'} · ${e.goal ? 'gol' : e.blockedBy ? 'bloqueado' : 'defendido'}`,
      ];
    case 'read':
      return [`Leitura de ${name(e.player)}: ${READ_GUESS_LABEL[e.guess]}`, e.correct ? 'acertou' : 'errou'];
    case 'skill':
      return e.success ? [`${name(e.player)} usou ${findSkill(e.skillId)?.name ?? e.skillId}`, e.note ?? 'ok'] : [`${name(e.player)}: ${findSkill(e.skillId)?.name ?? e.skillId}`, e.note ?? 'falhou'];
    case 'flow':
      return [`${name(e.player)} entrou em Flow`, findSkill(e.skillId)?.name ?? e.skillId];
    case 'steal':
      return [`${name(e.to)} tomou a bola`, `de ${name(e.from)}`];
    case 'pickup':
      return [`${name(e.player)} pegou a bola solta`, `${e.cell.x},${e.cell.y}`];
    case 'sprint':
      return [`${name(e.player)} deu sprint`, 'fôlego'];
    case 'out':
      return ['Bola fora', `posse: ${name(e.to)}`];
    case 'halftime':
      return ['Fim do primeiro tempo', ''];
    case 'end':
      return ['Fim de partida', e.winner === 'draw' ? 'empate' : `time ${e.winner}`];
    default:
      return null;
  }
}
