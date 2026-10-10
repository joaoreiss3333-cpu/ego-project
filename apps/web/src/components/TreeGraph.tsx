'use client';

import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cutRectPath } from '@ego/render/svg';
import { buyNodeAction } from '@/actions/character';
import { IDLE, type ActionState } from '@/lib/action-state';
import { artUrl } from '@/lib/art';
import { NODE_STATE_LABEL, NODE_TYPE_LABEL, type TreeNodeView, type TreeView } from '@/lib/tree';
import { Flash, SubmitButton } from './forms';

const NODE = 68;
const COL = 168;
const ROW = 150;
const PAD_X = 30;
const PAD_Y = 46;

function pos(n: TreeNodeView) {
  return { x: PAD_X + n.col * COL, y: PAD_Y + n.row * ROW };
}

export function TreeGraph({ tree, points, color, legend }: { tree: TreeView; points: number; color: string; legend?: ReactNode }) {
  const byId = useMemo(() => new Map(tree.nodes.map((n) => [n.id, n])), [tree.nodes]);
  const firstAvailable = tree.nodes.find((n) => n.state === 'disponivel')?.id ?? tree.nodes[0]?.id;
  const [selected, setSelected] = useState<string>(firstAvailable);
  const [lit, setLit] = useState<string | null>(null);
  const [state, formAction] = useActionState(buyNodeAction as (p: ActionState<{ nodeId: string }>, f: FormData) => Promise<ActionState<{ nodeId: string }>>, IDLE as ActionState<{ nodeId: string }>);
  const lastAt = useRef(0);

  useEffect(() => {
    if (state.at && state.at !== lastAt.current) {
      lastAt.current = state.at;
      if (state.ok && state.data?.nodeId) {
        setLit(state.data.nodeId);
        const t = window.setTimeout(() => setLit(null), 1600);
        return () => window.clearTimeout(t);
      }
    }
  }, [state]);

  const width = PAD_X * 2 + (tree.cols - 1) * COL + NODE + 40;
  const height = PAD_Y + (tree.rows - 1) * ROW + NODE + 58;
  const sel = byId.get(selected) ?? tree.nodes[0];

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected(id);
    }
  };

  return (
    <div className="tree">
      <div className="stack">
      <div className="tree__canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Árvore da linhagem" style={{ ['--rc' as string]: color }}>
          {/* ligações */}
          {tree.nodes
            .filter((n) => n.requires)
            .map((n) => {
              const parent = byId.get(n.requires!);
              if (!parent) return null;
              const a = pos(parent);
              const b = pos(n);
              const x1 = a.x + NODE;
              const y1 = a.y + NODE / 2;
              const x2 = b.x;
              const y2 = b.y + NODE / 2;
              const bend = x1 + 26;
              const dy = Math.abs(y2 - y1);
              const d = y1 === y2 ? `M${x1},${y1} H${x2}` : `M${x1},${y1} H${bend} L${bend + Math.min(dy, x2 - bend - 20)},${y2} H${x2}`;
              const cls = n.state === 'comprado' ? 'is-on' : n.state === 'disponivel' ? 'is-avail' : 'is-off';
              return <path key={`e-${n.id}`} d={d} className={`tree__edge ${cls}${lit === n.id ? ' is-lit' : ''}`} pathLength={1} />;
            })}
          {/* nós */}
          {tree.nodes.map((n) => {
            const p = pos(n);
            const isSel = n.id === selected;
            const shape = cutRectPath(p.x, p.y, NODE, NODE, 14);
            const cls = `tree__node st-${n.state} ty-${n.type}${isSel ? ' is-sel' : ''}${lit === n.id ? ' is-lit' : ''}`;
            return (
              <g
                key={n.id}
                className={cls}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${n.name}: ${NODE_STATE_LABEL[n.state]}${n.cost ? `, custa ${n.cost}` : ''}`}
                onClick={() => setSelected(n.id)}
                onKeyDown={(e) => onKey(e, n.id)}
              >
                {n.branchName ? (
                  <text x={p.x} y={p.y - 14} className="tree__branch">
                    RAMO / {n.branchName.toUpperCase()}
                  </text>
                ) : null}
                <path d={shape} className="tree__plate" />
                {n.skill ? <image href={artUrl.skill(n.skill.lineageId, n.skill.id)} x={p.x + 6} y={p.y + 6} width={NODE - 12} height={NODE - 12} className="tree__icon" /> : null}
                {n.type === 'evolution' ? (
                  <g>
                    <rect x={p.x + NODE - 30} y={p.y + NODE - 16} width={30} height={16} className="tree__badge" />
                    <text x={p.x + NODE - 15} y={p.y + NODE - 4.5} textAnchor="middle" className="tree__badge-t">
                      EVO
                    </text>
                  </g>
                ) : null}
                {n.type === 'awakening' && n.awakening ? (
                  <g>
                    <rect x={p.x} y={p.y + NODE + 3} width={NODE} height={4} className="tree__aw-bg" />
                    <rect x={p.x} y={p.y + NODE + 3} width={NODE * Math.min(1, n.awakening.target ? n.awakening.progress / n.awakening.target : 0)} height={4} className="tree__aw-fg" />
                  </g>
                ) : null}
                <path d={shape} className="tree__outline" />
                {n.state === 'comprado' ? <rect x={p.x + NODE - 10} y={p.y - 4} width={14} height={14} className="tree__tick" /> : null}
                <text x={p.x + NODE / 2} y={p.y + NODE + 24} textAnchor="middle" className="tree__label">
                  {n.name.length > 20 ? `${n.name.slice(0, 19)}.` : n.name}
                </text>
                <text x={p.x + NODE / 2} y={p.y + NODE + 39} textAnchor="middle" className="tree__cost">
                  {n.type === 'flow_start' ? 'INICIAL' : n.state === 'comprado' ? 'LIBERADO' : `${n.cost} PL`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {legend}
      </div>

      <aside className="tree__detail panel" aria-live="polite">
        <div className="panel__head">
          <h2 className="panel__title">{NODE_TYPE_LABEL[sel.type]}</h2>
          <span className={`tag st-tag st-${sel.state}`}>{NODE_STATE_LABEL[sel.state]}</span>
        </div>
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {sel.skill ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artUrl.skill(sel.skill.lineageId, sel.skill.id)} alt="" width={72} height={72} className="skicon" style={{ ['--s' as string]: '72px' }} />
            ) : null}
            <div className="stack stack--tight">
              <h3 className="tree__dname">{sel.name}</h3>
              <div className="row">
                {sel.skill ? <span className="tag">{sel.skill.kind === 'flow' ? 'Flow' : 'Ativa'}</span> : null}
                {sel.skill?.reaction ? <span className="tag" style={{ ['--tc' as string]: 'var(--success)' }}>Reação</span> : null}
                {sel.type !== 'flow_start' ? <span className="tag">{sel.cost} Ponto{sel.cost === 1 ? '' : 's'} de Linhagem</span> : null}
              </div>
            </div>
          </div>

          {sel.evolution ? (
            <div className="evo">
              <div>
                <span className="label">Hoje · {sel.evolution.skillName}</span>
                <p>{sel.evolution.before}</p>
              </div>
              <div className="evo__after">
                <span className="label accent">Com esta evolução</span>
                <p>{sel.evolution.after}</p>
              </div>
            </div>
          ) : sel.skill ? (
            <div>
              <span className="label">Efeito</span>
              <p className="tree__text">{sel.skill.text}</p>
            </div>
          ) : null}

          {sel.skill ? (
            <dl className="sheet">
              {sel.skill.kind === 'active' ? (
                <>
                  <dt>Fôlego</dt>
                  <dd>{sel.skill.stamina}</dd>
                  <dt>Recarga</dt>
                  <dd>
                    {sel.skill.cooldown} lance{sel.skill.cooldown === 1 ? '' : 's'}
                  </dd>
                </>
              ) : (
                <>
                  <dt>Custo</dt>
                  <dd>Flow cheio</dd>
                </>
              )}
            </dl>
          ) : null}

          {sel.skill ? (
            <div className="counter">
              <span className="label">Contra-jogo</span>
              <p>{sel.skill.counterplay}</p>
              <span className="label">Quando usar</span>
              <p>{sel.skill.when}</p>
            </div>
          ) : null}

          {sel.awakening ? (
            <div className="aw">
              <span className="label amber">Missão de Despertar</span>
              <b>{sel.awakening.name}</b>
              <p>{sel.awakening.description}</p>
              <div className="meter meter--thick" style={{ ['--p' as string]: `${sel.awakening.target ? Math.min(100, (sel.awakening.progress / sel.awakening.target) * 100) : 0}%`, ['--mc' as string]: 'var(--amber)' }}>
                <i />
              </div>
              <span className="t-mono">
                {sel.awakening.progress} / {sel.awakening.target} {sel.awakening.completed ? '· concluída' : '· só conta com esta linhagem equipada'}
              </span>
            </div>
          ) : null}

          {sel.state === 'bloqueado' && sel.requiresName ? <p className="flash flash--err">Compre antes: {sel.requiresName}.</p> : null}
          {sel.state === 'despertar_pendente' ? <p className="flash flash--err">Complete a missão de Despertar para liberar a compra.</p> : null}

          {sel.state === 'disponivel' ? (
            <form action={formAction} className="stack stack--tight">
              <input type="hidden" name="nodeId" value={sel.id} />
              <SubmitButton className="btn btn--primary btn--block btn--lg" disabled={points < sel.cost} pendingText="Liberando">
                Liberar por {sel.cost} PL
              </SubmitButton>
              {points < sel.cost ? <span className="label alert">Você tem {points} PL. Faltam {sel.cost - points}.</span> : <span className="label">Você tem {points} PL</span>}
            </form>
          ) : null}
          <Flash state={state} />
        </div>
      </aside>
    </div>
  );
}
