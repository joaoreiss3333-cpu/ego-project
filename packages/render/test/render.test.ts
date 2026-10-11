import { describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { autoTurn, botSlot, buildSetup, createMatch, keeperSlot, newDuelTraining, newPhysicalTraining, reachableCells } from '@ego/engine';
import { SELECTION_GROUPS } from '@ego/content';
import {
  assetsDir,
  renderDuelTraining,
  renderField,
  renderGachaGif,
  renderPhysical,
  renderPlanView,
  renderPlanning,
  renderProfileCard,
  renderStage,
  renderStepsGif,
  turnBanner,
  skillIcon,
  skillIconFile,
} from '../src';

const PNG = [0x89, 0x50, 0x4e, 0x47];
const isPng = (b: Buffer) => PNG.every((v, i) => b[i] === v);
const isGif = (b: Buffer) => b.subarray(0, 3).toString() === 'GIF';

function match() {
  const slots = [
    botSlot({ name: 'A', lineageId: 'isagi', level: 10, personality: 'coletivo', position: 'atacante' }, 'A1', 'A', 'regular'),
    keeperSlot('AGK', 'A', 10),
    botSlot({ name: 'B', lineageId: 'kuon', level: 10, personality: 'coletivo', position: 'atacante' }, 'B1', 'B', 'regular'),
    keeperSlot('BGK', 'B', 10),
  ];
  return { slots, state: createMatch(buildSetup({ id: 'r', seed: 'r', mode: '1v1', kind: 'simulacao', slots })) };
}

describe('renderização', () => {
  it('campo, painel e GIF', () => {
    const { slots, state } = match();
    expect(isPng(renderField(state, { showZones: true }))).toBe(true);
    expect(isPng(renderPlanning(state, 'A1', reachableCells(state, 'A1')))).toBe(true);
    expect(isPng(renderPlanView(state, 'A1', { reach: reachableCells(state, 'A1'), dest: { x: state.players.A1.pos.x + 1, y: state.players.A1.pos.y }, shot: true }))).toBe(true);
    expect(isPng(renderField(state, { legend: 'match', banner: { text: 'GOL!', tone: 'goal' } }))).toBe(true);
    const r = autoTurn(state, { botIds: slots.map((s) => s.id) }).result;
    expect(isGif(renderStepsGif(state, r))).toBe(true);
  });

  it('GIF de lances até um gol termina no campo de agora', () => {
    const { slots, state } = match();
    let s = state;
    for (let i = 0; i < 40 && !s.finished; i++) {
      const r = autoTurn(s, { botIds: slots.map((x) => x.id) }).result;
      const gif = renderStepsGif(s, r);
      expect(isGif(gif)).toBe(true);
      if (r.goal) expect(turnBanner(s, r)?.tone).toBe('goal');
      s = r.state;
    }
  });

  it('cards e telas', async () => {
    expect(
      isPng(
        await renderProfileCard({ name: 'Teste', number: 9, position: 'atacante', tokenColor: '#1F6BFF', level: 1, xp: 0, xpNeeded: 100, lineage: null, rank: { solo: null, time: null, mmrSolo: 1000, mmrTime: 1000 }, attrs: { velocidade: 3, drible: 3, passe: 3, chute: 3, fisico: 3, visao: 3, defesa: 3 }, caps: { velocidade: 6, drible: 6, passe: 6, chute: 6, fisico: 6, visao: 6, defesa: 6 }, marketValue: 1_000_000, stats: { goals: 0, assists: 0, matches: 0, wins: 0 }, serial: 'T' }),
      ),
    ).toBe(true);
    const { slots } = match();
    expect(isPng(renderDuelTraining(newDuelTraining('drible', 's', slots[0].attrs, 5)))).toBe(true);
    expect(isPng(renderPhysical(newPhysicalTraining('s', slots[0].attrs)))).toBe(true);
    expect(isPng(await renderStage(SELECTION_GROUPS[0].stages[0], 'Primeira Seleção', { cleared: false, unlocked: true, wins: 0 }))).toBe(true);
    expect(isGif(await renderGachaGif('rara', 'gagamaru', 'k'))).toBe(true);
  });

  it('usa a arte real quando o arquivo existe e o placeholder quando não', async () => {
    const dir = join(assetsDir(), 'skills', 'kuon');
    const file = join(dir, 'carrinho.png');
    expect(skillIconFile('kuon', 'carrinho')).toBeNull();
    const placeholder = await skillIcon('carrinho', 128);
    expect(placeholder.width).toBe(128);
    mkdirSync(dir, { recursive: true });
    const c = createCanvas(300, 300);
    writeFileSync(file, c.toBuffer('image/png'));
    try {
      expect(skillIconFile('kuon', 'carrinho')).toBe(file);
      const real = await skillIcon('carrinho', 128);
      expect(real.width).toBe(300);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
