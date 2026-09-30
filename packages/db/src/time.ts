/** Chaves de período em UTC-3 (horário de Brasília), para missões e limites diários. */
const OFFSET_MS = -3 * 3600 * 1000;

function shifted(d: Date): Date {
  return new Date(d.getTime() + OFFSET_MS);
}

export function dayKey(d = new Date()): string {
  return shifted(d).toISOString().slice(0, 10);
}

export function weekKey(d = new Date()): string {
  const t = shifted(d);
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Próxima virada de dia (00:00 de Brasília). */
export function nextDayReset(d = new Date()): Date {
  const t = shifted(d);
  const next = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
  return new Date(next - OFFSET_MS);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}
