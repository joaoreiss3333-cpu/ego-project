'use client';

import { useActionState, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { RARITY_COLORS, RARITY_LABEL, SITE_PATHS, type Rarity } from '@ego/content';
import { decideSpinAction, spinAction, type SpinReveal } from '@/actions/gacha';
import { IDLE, type ActionState } from '@/lib/action-state';
import { artUrl } from '@/lib/art';
import { Flash, SubmitButton } from './forms';

export interface LadderBand {
  rarity: Rarity;
  from: number;
  to: number;
  label: string;
  color: string;
}

type Phase = 'idle' | 'eval' | 'reveal';
const EVAL_MS = 2100;

export function SpinConsole({
  ladder,
  canSpin,
  reason,
  free,
  cost,
  currency,
  pending,
  hasLineage,
}: {
  ladder: LadderBand[];
  canSpin: boolean;
  reason: string | null;
  free: boolean;
  cost: number;
  currency: string;
  pending: SpinReveal | null;
  hasLineage: boolean;
}) {
  const [spinState, spinFormAction] = useActionState(spinAction, IDLE as ActionState<SpinReveal>);
  const [decideState, decideFormAction] = useActionState(decideSpinAction, IDLE);
  const [result, setResult] = useState<SpinReveal | null>(null);
  const [phase, setPhase] = useState<Phase>(pending ? 'reveal' : 'idle');
  const [shownRoll, setShownRoll] = useState(0);
  const lastSpin = useRef(0);
  const lastDecide = useRef(0);

  const current = result ?? pending;

  // novo giro: roda a tela de avaliação e depois revela
  useEffect(() => {
    if (!spinState.at || spinState.at === lastSpin.current) return;
    lastSpin.current = spinState.at;
    if (!spinState.ok || !spinState.data) return;
    const r = spinState.data;
    setResult(r);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShownRoll(r.roll);
      setPhase('reveal');
      return;
    }
    setPhase('eval');
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / (EVAL_MS * 0.8));
      const e = 1 - Math.pow(1 - k, 4);
      setShownRoll(r.roll * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const to = window.setTimeout(() => setPhase('reveal'), EVAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(to);
    };
  }, [spinState]);

  // decisão tomada: volta ao console
  useEffect(() => {
    if (!decideState.at || decideState.at === lastDecide.current) return;
    lastDecide.current = decideState.at;
    if (decideState.ok) {
      setResult(null);
      setPhase('idle');
    }
  }, [decideState]);

  useEffect(() => {
    if (pending && phase === 'idle' && !result) setPhase('reveal');
  }, [pending, phase, result]);

  const band = current ? ladder.find((b) => b.rarity === current.rarity) : undefined;
  const color = current ? RARITY_COLORS[current.rarity] : undefined;

  return (
    <section className={`spin panel panel--hot phase-${phase}`} style={color ? ({ '--rc': color } as CSSProperties) : undefined} aria-live="polite">
      <div className="panel__head">
        <h2 className="panel__title">Cabine de avaliação</h2>
        <span className="panel__code">{phase === 'idle' ? 'AGUARDANDO' : phase === 'eval' ? 'AVALIANDO' : 'AVALIAÇÃO CONCLUÍDA'}</span>
      </div>

      <div className="spin__screen">
        <div className="spin__scan" aria-hidden />
        {phase === 'idle' ? (
          <div className="spin__idle">
            <span className="label">Índice de avaliação</span>
            <span className="spin__roll">0.000000</span>
            <p className="ink-2">Um número de 0 a 1 é sorteado. A faixa onde ele cai define a raridade. A garantia passa por cima do número quando o contador chega no limite.</p>
          </div>
        ) : null}
        {phase !== 'idle' && current ? (
          <div className="spin__eval">
            <span className="label">{current.forcedBy ? 'Garantia ativada' : 'Índice de avaliação'}</span>
            <span className="spin__roll">{(phase === 'eval' ? shownRoll : current.roll).toFixed(6)}</span>
            {current.forcedBy ? (
              <span className="t-mono amber">Contador cheio: {RARITY_LABEL[current.forcedBy]} {current.forcedBy === 'lendaria' ? 'ou melhor ' : ''}garantida</span>
            ) : null}
          </div>
        ) : null}

        <div className="ladder" aria-hidden>
          {ladder.map((b) => (
            <div
              key={b.rarity}
              className={`ladder__band${phase === 'reveal' && band?.rarity === b.rarity ? ' is-hit' : ''}`}
              style={{ width: `${(b.to - b.from) * 100}%`, ['--bc' as string]: b.color } as CSSProperties}
            >
              <span>{b.label}</span>
            </div>
          ))}
          {phase !== 'idle' && current && !current.forcedBy ? (
            <div className="ladder__mark" style={{ left: `${(phase === 'eval' ? shownRoll : current.roll) * 100}%` }} />
          ) : null}
        </div>

        {phase === 'reveal' && current ? (
          <div className="reveal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="reveal__img" src={artUrl.lineage(current.lineageId)} alt="" width={140} height={140} />
            <div className="stack stack--tight">
              <span className="reveal__rarity">{RARITY_LABEL[current.rarity]}</span>
              <span className="reveal__name">{current.lineageName}</span>
              <span className="ink-2">{current.tagline}</span>
              <span className="t-mono muted" style={{ fontSize: 12 }}>
                {result ? (current.isNew ? 'Linhagem nova no seu registro.' : 'Você já tem esta linhagem. A árvore dela está salva.') : 'Resultado pendente de decisão.'}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="spin__actions">
        {phase === 'reveal' && current && current.autoAccepted ? (
          <div className="stack">
            <p className="flash">Primeira linhagem registrada direto: sem linhagem não há o que descartar.</p>
            <div className="row">
              <Link href={SITE_PATHS.linhagem} className="btn btn--primary">
                Ver a árvore
              </Link>
              <button type="button" className="btn btn--ghost" onClick={() => (setResult(null), setPhase('idle'))}>
                Voltar ao console
              </button>
            </div>
          </div>
        ) : phase === 'reveal' && current ? (
          <form action={decideFormAction} className="stack">
            <input type="hidden" name="logId" value={current.logId} />
            <p className="ink-2" style={{ margin: 0, fontSize: 14 }}>
              {hasLineage
                ? 'Aceitar equipa esta linhagem agora. A árvore da linhagem atual continua salva: se ela voltar num giro, você retoma de onde parou. Descartar mantém tudo como está.'
                : 'Aceitar equipa esta linhagem.'}
            </p>
            <div className="row">
              <SubmitButton className="btn btn--primary btn--lg" name="decision" value="aceitar" pendingText="Registrando">
                Aceitar {current.lineageName}
              </SubmitButton>
              <SubmitButton className="btn btn--danger btn--lg" name="decision" value="descartar" pendingText="Registrando">
                Descartar
              </SubmitButton>
            </div>
          </form>
        ) : (
          <form action={spinFormAction} className="row">
            <SubmitButton className="btn btn--primary btn--lg" disabled={!canSpin || phase === 'eval'} pendingText="Sorteando">
              {free ? 'Girar grátis' : `Girar · ${cost} ${currency}`}
            </SubmitButton>
            {reason ? <span className="label alert">{reason}</span> : null}
          </form>
        )}
        <Flash state={spinState.ok ? decideState : spinState} />
      </div>
    </section>
  );
}
