'use client';

import { useEffect, useRef, useState } from 'react';

const nf = new Intl.NumberFormat('pt-BR');

/**
 * Número que sobe até o valor final ao entrar na tela. Com movimento reduzido, mostra o valor direto.
 * `from` permite contar para baixo (ex.: posição no ranking descendo até a sua).
 */
export function CountUp({
  value,
  from = 0,
  duration = 900,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
  group = true,
}: {
  value: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  group?: boolean;
}) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduce || from === value) {
      setShown(value);
      return;
    }
    setShown(from);
    let raf = 0;
    let start = 0;
    const run = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (value - from) * eased);
      if (k < 1) raf = requestAnimationFrame(run);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          raf = requestAnimationFrame(run);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, from, duration]);

  const text =
    decimals > 0
      ? shown.toFixed(decimals)
      : group
        ? nf.format(Math.round(shown))
        : String(Math.round(shown));
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
