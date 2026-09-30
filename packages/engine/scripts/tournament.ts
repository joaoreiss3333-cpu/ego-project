import type { Difficulty } from '@ego/content';
import { autoTurn, botSlot, buildSetup, createMatch, keeperSlot, type SlotSetup, type Team } from '../src';
const [a, b, nStr, mode] = process.argv.slice(2) as [Difficulty, Difficulty, string, '1v1'|'2v2'|'3v3'];
const N = Number(nStr ?? 100);
const lineages = ['isagi', 'chigiri', 'lavinho', 'gagamaru', 'kuon'];
let aw = 0, bw = 0, d = 0, ag = 0, bg = 0;
for (let i = 0; i < N; i++) {
  const flip = i % 2 === 1;
  const n = Number(mode[0]);
  const slots: SlotSetup[] = [];
  for (const [team, diff] of [['A', flip ? b : a], ['B', flip ? a : b]] as [Team, Difficulty][]) {
    for (let k = 0; k < n; k++) slots.push(botSlot({ name: `${team}${k}`, lineageId: lineages[(i + k) % 5], level: 20, personality: 'coletivo', position: k === 0 ? 'atacante' : 'meio' }, `${team}${k + 1}`, team, diff));
    slots.push(keeperSlot(`${team}GK`, team, 20, 'regular'));
  }
  let s = createMatch(buildSetup({ id: `t${i}`, seed: `tour-${i}`, mode, kind: 'simulacao', slots }));
  while (!s.finished) s = autoTurn(s, { botIds: slots.map((x) => x.id) }).result.state;
  const at: Team = flip ? 'B' : 'A';
  const bt: Team = flip ? 'A' : 'B';
  ag += s.score[at]; bg += s.score[bt];
  if (s.winner === at) aw++; else if (s.winner === bt) bw++; else d++;
}
console.log(`${a} x ${b} (${mode}, ${N}): ${aw}V ${d}E ${bw}D | gols ${ag} x ${bg}`);
