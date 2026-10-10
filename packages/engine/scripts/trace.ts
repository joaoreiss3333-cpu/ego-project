import { botSlot, keeperSlot } from '../src/bots';
import { autoTurn } from '../src/runner';
import { buildSetup, createMatch } from '../src/setup';
const mode = (process.argv[2] ?? '1v1') as '1v1';
const n = Number(mode[0]);
const lin = ['chigiri','isagi','lavinho','gagamaru','kuon'];
const slots = [];
for (const t of ['A','B'] as const) {
  for (let i=0;i<n;i++) slots.push(botSlot({ name: `${t}${i+1}-${lin[(i+(t==='A'?0:2))%5]}`, lineageId: lin[(i+(t==='A'?0:2))%5], level: 20, personality: 'coletivo', position: 'atacante' }, `${t}${i+1}`, t, 'elite'));
  slots.push(keeperSlot(`${t}GK`, t, 20, 'elite'));
}
let s = createMatch(buildSetup({ id: 'x', seed: process.argv[3] ?? 's1', mode, kind: 'simulacao', slots }));
while (!s.finished) {
  const out = autoTurn(s, { botIds: slots.map(x=>x.id) });
  const r = out.result;
  const pl = Object.values(r.plans).filter(p=>!p.playerId.endsWith('GK')).map(p=>`${p.playerId}:${p.action}${p.skill?'+'+p.skill:''}${p.useFlow?'+FLOW':''}${p.sprint?'+spr':''}(${p.dest.x},${p.dest.y})`).join(' ');
  console.log(`T${s.turn} ball=${s.ball.holder} ${out.debug.map(d=>d.plan+(d.combo?'/'+d.combo:'')).join('|')}\n   ${pl}\n   -> ${r.log.join(' / ')} [${r.state.score.A}x${r.state.score.B}]`);
  s = r.state;
}
