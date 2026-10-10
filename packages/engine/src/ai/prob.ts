/** P(a + d10 > b + d10). Empate favorece b (a defesa). */
const DIFF: number[] = [];
for (let k = -9; k <= 9; k++) DIFF.push((10 - Math.abs(k)) / 100);

export function pBeat(a: number, b: number): number {
  const need = b - a; // precisa de X - Y > need
  let p = 0;
  for (let k = -9; k <= 9; k++) if (k > need) p += DIFF[k + 9];
  return Math.max(0, Math.min(1, p));
}

/** P(a + d10 >= limiar). */
export function pAtLeast(a: number, threshold: number): number {
  const need = threshold - a;
  if (need <= 1) return 1;
  if (need > 10) return 0;
  return (10 - need + 1) / 10;
}

export function softmaxPick<T>(items: T[], scores: number[], temperature: number, r: number): number {
  if (!items.length) return -1;
  const t = Math.max(0.05, temperature);
  const max = Math.max(...scores);
  const w = scores.map((s) => Math.exp((s - max) / t));
  const total = w.reduce((a, b) => a + b, 0);
  let acc = r * total;
  for (let i = 0; i < w.length; i++) {
    acc -= w[i];
    if (acc < 0) return i;
  }
  return w.length - 1;
}

export function normalize(rec: Record<string, number>): Record<string, number> {
  const total = Object.values(rec).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const n = Object.keys(rec).length || 1;
    return Object.fromEntries(Object.keys(rec).map((k) => [k, 1 / n]));
  }
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v / total]));
}
