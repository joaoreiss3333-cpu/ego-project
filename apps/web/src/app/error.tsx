'use client';

import { useEffect } from 'react';

/** Erro inesperado: mensagem curta, sem detalhes técnicos para o jogador. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="empty">
      <span className="empty__code">Falha no monitor{error.digest ? ` / ${error.digest}` : ''}</span>
      <h2>Algo saiu do lugar</h2>
      <p>Não foi possível carregar esta página agora. Tente de novo em instantes.</p>
      <button type="button" className="btn btn--primary" onClick={reset}>
        Tentar de novo
      </button>
    </div>
  );
}
