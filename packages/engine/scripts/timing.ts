/** Mede o tempo de decisão da IA (pior caso e p99) em partidas grandes. */
import { LINEAGES, type MatchMode } from '@ego/content';
import { autoTurn, botNodes, botSlot, buildSetup, createMatch, keeperSlot, type SlotSetup, type Team } from '../src';
const mode = (process.argv[2] ?? '5v5') as MatchMode;
const N = Number(process.argv[3] ?? 20);
const times: { ms: number; role: string; name: string }[] = [];
for (let m = 0; m < N; m++) {
  const n = Number(mode[0]);
  const slots: SlotSetup[] = [];
  for (const t of ['A', 'B'] as Team[]) {
    for (let i = 0; i < n; i++) {
      const l = LINEAGES[(m + i + (t === 'B' ? 2 : 0)) % LINEAGES.length];
      slots.push(botSlot({ name: `${l.name}${t}${i}`, lineageId: l.id, level: 30, nodes: botNodes(l.id, 40, true), personality: 'coletivo', position: 'atacante' }, `${t}${i + 1}`, t, m % 2 ? 'chefe' : 'elite'));
    }
    slots.push(keeperSlot(`${t}GK`, t, 30));
  }
  let s = createMatch(buildSetup({ id: `t${m}`, seed: `timing-${m}`, mode, kind: 'simulacao', slots }));
  while (!s.finished) {
    for (const p of Object.values(s.players)) if (m % 3 === 0) p.flow = 100;
    const out = autoTurn(s, { botIds: slots.map((x) => x.id) });
    for (const d of out.debug) for (const b of d.bots) times.push({ ms: b.ms, role: b.role, name: b.name });
    s = out.result.state;
  }
}
times.sort((a, b) => b.ms - a.ms);
const p99 = times[Math.floor(times.length * 0.01)];
console.log(`${mode}: ${times.length} decisões · máximo ${times[0].ms} ms (${times[0].name}, ${times[0].role}) · p99 ${p99.ms} ms · média ${(times.reduce((a, t) => a + t.ms, 0) / times.length).toFixed(2)} ms`);
console.log(times.slice(0, 5).map((t) => `${t.ms}ms ${t.name} ${t.role}`).join(' | '));
