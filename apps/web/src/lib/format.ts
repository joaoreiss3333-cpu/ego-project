import { GAME } from '@ego/content';

const nf = new Intl.NumberFormat('pt-BR');
export const fmt = (n: number) => nf.format(n);
export const pct = (x: number, digits = 1) =>
  `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(x * 100)}%`;

export const TZ = 'America/Sao_Paulo';

export function fmtDate(d: Date | string, withTime = true): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export const ienes = (n: number) => `${fmt(n)} ${GAME.commonCurrency.plural}`;
export const coins = (n: number) => `${fmt(n)} ${n === 1 ? GAME.premiumCurrency.name : GAME.premiumCurrency.plural}`;
export const money = (n: number) => `${GAME.commonCurrency.short} ${fmt(n)}`;

/** Plural simples. */
export const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

export const pad2 = (n: number) => String(n).padStart(2, '0');
