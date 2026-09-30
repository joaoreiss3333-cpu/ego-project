'use client';

import { removePortraitAction, uploadPortraitAction } from '@/actions/character';
import { ActionForm, SubmitButton } from './forms';

/** Envio do retrato: PNG, JPEG ou WebP até 1 MB (conferido pelos bytes no servidor). */
export function PortraitForm({ hasCustom }: { hasCustom: boolean }) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Retrato</h2>
        <span className="panel__code">PNG / JPEG / WEBP · 1 MB</span>
      </div>
      <div className="stack">
        <ActionForm action={uploadPortraitAction} className="stack stack--tight">
          <input className="input" type="file" name="portrait" accept="image/png,image/jpeg,image/webp" required aria-label="Arquivo do retrato" />
          <SubmitButton className="btn btn--primary btn--sm" pendingText="Enviando">
            Enviar retrato
          </SubmitButton>
        </ActionForm>
        {hasCustom ? (
          <ActionForm action={removePortraitAction}>
            <SubmitButton className="btn btn--ghost btn--sm" pendingText="Removendo">
              Voltar para a silhueta
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Sem retrato enviado: o card usa a silhueta na cor do seu token.
          </p>
        )}
      </div>
    </section>
  );
}
