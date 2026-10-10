'use client';

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { IDLE, type ActionState, type FormActionFn } from '@/lib/action-state';

export function Flash({ state }: { state: ActionState }) {
  return (
    <p className={`flash${state.ok ? '' : ' flash--err'}`} role="status" aria-live="polite">
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  className = 'btn btn--primary',
  disabled,
  pendingText = 'Processando',
  name,
  value,
  title,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pendingText?: string;
  name?: string;
  value?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending} name={name} value={value} title={title}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Formulário ligado a uma Server Action, com a mensagem do resultado logo abaixo. */
export function ActionForm({
  action,
  children,
  className,
  flash = true,
  onResult,
}: {
  action: FormActionFn;
  children: ReactNode;
  className?: string;
  flash?: boolean;
  onResult?: (s: ActionState) => void;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const last = useRef(0);
  useEffect(() => {
    if (state.at && state.at !== last.current) {
      last.current = state.at;
      onResult?.(state);
    }
  }, [state, onResult]);
  return (
    <form action={formAction} className={className}>
      {children}
      {flash ? <Flash state={state} /> : null}
    </form>
  );
}

/**
 * Ação destrutiva em duas etapas: o primeiro clique mostra o custo e pede confirmação.
 */
export function ConfirmAction({
  action,
  label,
  question,
  detail,
  confirmLabel = 'Confirmar',
  hidden,
  disabled,
  disabledReason,
}: {
  action: FormActionFn;
  label: string;
  question: string;
  detail?: ReactNode;
  confirmLabel?: string;
  hidden?: Record<string, string>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, IDLE);
  useEffect(() => {
    if (state.at) setOpen(false);
  }, [state.at]);
  return (
    <div className="stack stack--tight">
      {!open ? (
        <div className="row">
          <button type="button" className="btn btn--danger" disabled={disabled} onClick={() => setOpen(true)}>
            {label}
          </button>
          {disabled && disabledReason ? <span className="muted t-mono" style={{ fontSize: 12 }}>{disabledReason}</span> : null}
        </div>
      ) : (
        <form action={formAction} className="confirm">
          {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          <span className="confirm__q">{question}</span>
          {detail ? <div className="ink-2" style={{ fontSize: 14 }}>{detail}</div> : null}
          <div className="row">
            <SubmitButton className="btn btn--danger">{confirmLabel}</SubmitButton>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <Flash state={state} />
    </div>
  );
}
