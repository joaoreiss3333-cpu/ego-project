'use client';

import { useEffect, useState } from 'react';
import { applyBuildAction, deleteBuildAction, saveBuildAction, setLoadoutAction } from '@/actions/character';
import { artUrl } from '@/lib/art';
import { ActionForm, SubmitButton } from './forms';

export interface LoadoutSkill {
  id: string;
  lineageId: string;
  name: string;
  kind: 'active' | 'flow';
  reaction: boolean;
  stamina: number;
  baseStamina: number;
  cooldown: number;
  masteryLabel: string;
  text: string;
}

interface Build {
  name: string;
  active: string[];
  flow: string;
}

function Icon({ s, size = 56 }: { s: LoadoutSkill; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={artUrl.skill(s.lineageId, s.id)} alt="" width={size} height={size} className="skicon" style={{ ['--s' as string]: `${size}px` }} />;
}

export function LoadoutEditor({ skills, current, builds, lineageName, maxActive }: { skills: LoadoutSkill[]; current: { active: string[]; flow: string }; builds: Build[]; lineageName: string; maxActive: number }) {
  const [active, setActive] = useState<string[]>(current.active);
  const [flow, setFlow] = useState<string>(current.flow);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const currentKey = `${current.active.join('|')}#${current.flow}`;
  useEffect(() => {
    setActive(current.active);
    setFlow(current.flow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const dirty = active.join('|') !== current.active.join('|') || flow !== current.flow;
  const toggle = (s: LoadoutSkill) => {
    if (s.kind === 'flow') return setFlow(s.id);
    setActive((a) => (a.includes(s.id) ? a.filter((x) => x !== s.id) : a.length >= maxActive ? a : [...a, s.id]));
  };
  const hidden = (
    <>
      {active.map((id) => (
        <input key={id} type="hidden" name="active" value={id} />
      ))}
      <input type="hidden" name="flow" value={flow} />
    </>
  );
  const staminaTotal = active.reduce((a, id) => a + (byId.get(id)?.stamina ?? 0), 0);

  return (
    <div className="loadout">
      <section className="panel panel--hot loadout__slots">
        <div className="panel__head">
          <h2 className="panel__title">Em campo</h2>
          <span className="panel__code">{dirty ? 'ALTERADO · NÃO SALVO' : 'SALVO'}</span>
        </div>
        <div className="slots">
          {Array.from({ length: maxActive }, (_, i) => i).map((i) => {
            const s = active[i] ? byId.get(active[i]) : undefined;
            return (
              <button key={i} type="button" className={`slot${s ? ' is-full' : ''}`} onClick={() => s && toggle(s)} aria-label={s ? `Tirar ${s.name}` : `Espaço ativo ${i + 1} vazio`}>
                <span className="slot__code">ATV 0{i + 1}</span>
                {s ? (
                  <>
                    <Icon s={s} size={64} />
                    <span className="slot__name">{s.name}</span>
                    <span className="slot__meta">
                      FOL {s.stamina} · REC {s.cooldown}
                    </span>
                  </>
                ) : (
                  <span className="slot__empty">Vazio</span>
                )}
              </button>
            );
          })}
          <div className={`slot slot--flow${flow ? ' is-full' : ''}`}>
            <span className="slot__code">FLOW</span>
            {flow && byId.get(flow) ? (
              <>
                <Icon s={byId.get(flow)!} size={64} />
                <span className="slot__name">{byId.get(flow)!.name}</span>
                <span className="slot__meta">FLOW CHEIO</span>
              </>
            ) : (
              <span className="slot__empty">Escolha um Flow</span>
            )}
          </div>
        </div>
        <div className="row row--between" style={{ marginTop: 14 }}>
          <span className="label">Fôlego somado das ativas: {staminaTotal}</span>
          <ActionForm action={setLoadoutAction} className="row">
            {hidden}
            <button type="button" className="btn btn--ghost btn--sm" disabled={!dirty} onClick={() => (setActive(current.active), setFlow(current.flow))}>
              Desfazer
            </button>
            <SubmitButton className="btn btn--primary" disabled={!dirty || !flow} pendingText="Salvando">
              Salvar loadout
            </SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Liberadas em {lineageName}</h2>
          <span className="panel__code">CLIQUE PARA ENTRAR OU SAIR</span>
        </div>
        <div className="sklist">
          {skills.map((s) => {
            const on = s.kind === 'flow' ? flow === s.id : active.includes(s.id);
            const full = s.kind === 'active' && !on && active.length >= maxActive;
            return (
              <button key={s.id} type="button" className={`sk${on ? ' is-on' : ''}`} onClick={() => toggle(s)} disabled={full} aria-pressed={on} title={full ? `Os ${maxActive} espaços ativos estão ocupados` : undefined}>
                <Icon s={s} />
                <span className="sk__body">
                  <span className="sk__head">
                    <b>{s.name}</b>
                    <span className="tag">{s.kind === 'flow' ? 'Flow' : 'Ativa'}</span>
                    {s.reaction ? (
                      <span className="tag" style={{ ['--tc' as string]: 'var(--success)' }}>
                        Reação
                      </span>
                    ) : null}
                    {s.masteryLabel !== '—' ? <span className="tag" style={{ ['--tc' as string]: 'var(--electric-2)' }}>Maestria {s.masteryLabel}</span> : null}
                  </span>
                  <span className="sk__text">{s.text}</span>
                  {s.kind === 'active' ? (
                    <span className="sk__meta">
                      Fôlego {s.stamina}
                      {s.stamina !== s.baseStamina ? ` (base ${s.baseStamina})` : ''} · Recarga {s.cooldown}
                    </span>
                  ) : (
                    <span className="sk__meta">Ativa com a barra de Flow cheia</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Builds salvas</h2>
          <span className="panel__code">{builds.length} {builds.length === 1 ? 'SALVA' : 'SALVAS'} NESTA LINHAGEM</span>
        </div>
        <div className="stack">
          {builds.length ? (
            <div className="builds">
              {builds.map((b) => (
                <div key={b.name} className="build">
                  <div className="build__name">{b.name}</div>
                  <div className="row" style={{ gap: 6 }}>
                    {[...b.active, b.flow].map((id) => {
                      const s = byId.get(id);
                      return s ? (
                        <span key={id} title={s.name}>
                          <Icon s={s} size={34} />
                        </span>
                      ) : (
                        <span key={id} className="tag">
                          bloqueada
                        </span>
                      );
                    })}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <ActionForm action={applyBuildAction}>
                      <input type="hidden" name="name" value={b.name} />
                      <SubmitButton className="btn btn--primary btn--sm" pendingText="...">
                        Aplicar
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={deleteBuildAction}>
                      <input type="hidden" name="name" value={b.name} />
                      <SubmitButton className="btn btn--danger btn--sm" pendingText="...">
                        Apagar
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Nenhuma build salva. Monte o loadout acima e guarde com um nome.
            </p>
          )}
          <ActionForm action={saveBuildAction} className="row">
            {hidden}
            <input className="input" name="name" maxLength={24} required placeholder="Nome da build" style={{ flex: 1, minWidth: 160 }} />
            <SubmitButton className="btn btn--ghost" disabled={!flow} pendingText="Salvando">
              Salvar seleção atual
            </SubmitButton>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
