'use client';

import { useEffect, useState } from 'react';

/** Relógio do monitor (horário de Brasília, o mesmo das missões). */
export function SiteClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>MONITOR BRT {now ?? '--/-- --:--'}</span>;
}
