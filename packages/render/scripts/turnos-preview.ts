import { writeFileSync } from 'node:fs';
import { botSlot, buildSetup, keeperSlot, turnos } from '@ego/engine';
import { renderTurnosField } from '../src';

/** Gera uma imagem de amostra do campo de turnos: tsx scripts/turnos-preview.ts <saida.png> [modo] */
const out = process.argv[2] ?? 'turnos.png';
const mode = (process.argv[3] ?? '3v3') as '3v3';
const n = Number(mode[0]);
const slots = [];
for (const t of ['A', 'B'] as const) {
  for (let i = 0; i < n; i++) slots.push(botSlot({ name: `${t}${i + 1}`, lineageId: 'isagi', level: 10, personality: 'coletivo', position: 'atacante' }, `${t}${i + 1}`, t, 'regular'));
  slots.push(keeperSlot(`${t}GK`, t, 10, 'regular'));
}
let s = turnos.createTurnos(buildSetup({ id: 'p', seed: 'x', mode, kind: 'simulacao', slots, turnsPerHalf: 6, halves: 2 }));
let events: turnos.TEvent[] = [];
for (let i = 0; i < 14; i++) {
  const { actor, action } = turnos.autoAction(s);
  const r = turnos.applyAction(s, actor, action);
  s = r.state;
  events = r.events;
}
const actor = turnos.currentActorId(s);
const L = turnos.legalActions(s, actor);
writeFileSync(out, renderTurnosField(s, { actor, events, numbered: L.move, hudRight: 'PRÉVIA' }));
console.log('ok', out, actor, L.move.length);
