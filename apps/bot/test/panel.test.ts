import { describe, expect, it } from 'vitest';
import { botSlot, buildSetup, keeperSlot, turnos, type Cell } from '@ego/engine';
import { applyClick, describe as describeAction, guessScreen, newDraft, panelScreen, type Draft } from '../src/match/panel';
import { MAX_COMPONENTS, countComponents, edit, screen, type ScreenSpec } from '../src/ui';

type TState = turnos.TState;

function match(mode: '2v2' | '3v3' = '2v2'): TState {
  const n = Number(mode[0]);
  const slots = [];
  for (const t of ['A', 'B'] as const) {
    for (let i = 0; i < n; i++) slots.push(botSlot({ name: `${t}${i + 1}`, lineageId: 'isagi', level: 12, personality: 'coletivo', position: 'atacante' }, `${t}${i + 1}`, t, 'regular'));
    slots.push(keeperSlot(`${t}GK`, t, 12, 'regular'));
  }
  return turnos.createTurnos(buildSetup({ id: 'm-panel', seed: 'panel', mode, kind: 'simulacao', slots, turnsPerHalf: 6, halves: 2 }));
}

function put(s: TState, pos: Record<string, Cell>, holder: string | null, actor: string): TState {
  const c = structuredClone(s);
  for (const [id, p] of Object.entries(pos)) c.players[id].pos = { ...p };
  c.ball = holder ? { holder, pos: { ...c.players[holder].pos } } : { holder: null, pos: { x: 5, y: 3 } };
  c.cursor = c.order.indexOf(actor);
  return c;
}

/** Valida a tela como o Discord faria: builders + limites. */
function check(spec: ScreenSpec) {
  expect(countComponents(spec)).toBeLessThanOrEqual(MAX_COMPONENTS);
  const p = screen(spec);
  edit(spec);
  const json = JSON.stringify(p.components.map((c) => c.toJSON()));
  for (const m of json.matchAll(/"custom_id":"([^"]*)"/g)) expect(m[1].length).toBeLessThanOrEqual(100);
  const texts = [...json.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
  expect(texts.reduce((a, t) => a + t.length, 0)).toBeLessThanOrEqual(4000);
}

const deadline = Date.now() + 25_000;
const screenOf = (s: TState, actor: string, d: Draft) => panelScreen({ matchId: 'm-panel', state: s, actorId: actor, draft: d, deadline });

describe('painel do turno', () => {
  it('cada papel tem um menu válido (portador, sem a bola, goleiro, falta e pênalti)', () => {
    const base = match();
    const cases: [string, TState][] = [
      ['portador', put(base, { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 }, A2: { x: 3, y: 3 }, B2: { x: 8, y: 1 } }, 'A1', 'A1')],
      ['sem a bola', put(base, { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 }, A2: { x: 3, y: 3 }, B2: { x: 8, y: 1 } }, 'A1', 'B1')],
      ['goleiro com a bola', put(base, { AGK: { x: 0, y: 3 }, A2: { x: 2, y: 3 }, B1: { x: 8, y: 1 }, B2: { x: 8, y: 5 } }, 'AGK', 'AGK')],
      ['goleiro sem a bola', put(base, { A1: { x: 4, y: 3 }, B1: { x: 6, y: 3 } }, 'B1', 'AGK')],
    ];
    for (const [, s] of cases) check(screenOf(s, turnos.currentActorId(s), newDraft()));
    // falta e pênalti
    let s = cases[1][1];
    const foul = turnos.applyAction(s, 'B1', { kind: 'bote' }, { dice: [1, 10, 1, 9] }).state;
    expect(foul.freeKick?.kind).toBe('direto');
    check(screenOf(foul, 'A1', newDraft()));
    s = put(base, { A1: { x: 9, y: 2 }, B1: { x: 9, y: 3 }, A2: { x: 3, y: 3 }, B2: { x: 4, y: 5 } }, 'A1', 'B1');
    const pen = turnos.applyAction(s, 'B1', { kind: 'bote' }, { dice: [1, 10, 1, 9] }).state;
    expect(pen.freeKick?.kind).toBe('penalti');
    check(screenOf(pen, 'A1', newDraft()));
  });

  it('o portador percorre as etapas e chega à ação confirmada', () => {
    const s = put(match(), { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 }, A2: { x: 3, y: 3 }, B2: { x: 8, y: 1 } }, 'A1', 'A1');
    const d = newDraft();
    // mover
    applyClick(s, 'A1', d, 'mv', undefined, null);
    expect(d.step.s).toBe('move');
    check(screenOf(s, 'A1', d));
    const dest = turnos.legalActions(s, 'A1').move[0];
    applyClick(s, 'A1', d, 'pick', undefined, [`${dest.x},${dest.y}`]);
    expect(d.step.s).toBe('confirm');
    check(screenOf(s, 'A1', d));
    const done = applyClick(s, 'A1', d, 'ok', undefined, null);
    expect(done).toEqual({ kind: 'act', action: { kind: 'mover', dest } });
    expect(() => turnos.applyAction(s, 'A1', (done as { action: turnos.Action }).action)).not.toThrow();
    // driblar (um alvo só: vai direto à confirmação)
    const d2 = newDraft();
    applyClick(s, 'A1', d2, 'dr', undefined, null);
    expect(d2.step.s).toBe('confirm');
    check(screenOf(s, 'A1', d2));
    // passar: tipo → destino
    const d3 = newDraft();
    applyClick(s, 'A1', d3, 'ps', undefined, null);
    check(screenOf(s, 'A1', d3));
    applyClick(s, 'A1', d3, 'pt', 'curto', null);
    expect(d3.step.s).toBe('passTo');
    check(screenOf(s, 'A1', d3));
    // chutar
    const d4 = newDraft();
    applyClick(s, 'A1', d4, 'sh', undefined, null);
    check(screenOf(s, 'A1', d4));
    applyClick(s, 'A1', d4, 'cr', '2', null);
    expect(d4.step).toMatchObject({ s: 'confirm', action: { kind: 'chutar', corner: 2 } });
    check(screenOf(s, 'A1', d4));
  });

  it('sem a bola: bote, carrinho e conter mostram a chance e confirmam', () => {
    const s = put(match(), { A1: { x: 5, y: 3 }, B1: { x: 6, y: 3 }, A2: { x: 3, y: 3 }, B2: { x: 8, y: 1 } }, 'A1', 'B1');
    for (const verb of ['bote', 'carr', 'cn']) {
      const d = newDraft();
      applyClick(s, 'B1', d, verb, undefined, null);
      expect(d.step.s).toBe('confirm');
      check(screenOf(s, 'B1', d));
      const act = (d.step as { action: turnos.Action }).action;
      expect(describeAction(s, 'B1', act)).toMatch(/%|Conter/);
      expect(() => turnos.applyAction(s, 'B1', act)).not.toThrow();
    }
  });

  it('goleiro: posturas, destino e comandar', () => {
    const s = put(match(), { A1: { x: 4, y: 3 }, A2: { x: 1, y: 2 }, B1: { x: 6, y: 3 }, AGK: { x: 0, y: 3 } }, 'B1', 'AGK');
    for (const posture of ['posicionar', 'sair', 'comandar', 'adiantar']) {
      const d: Draft = newDraft();
      applyClick(s, 'AGK', d, 'gk', posture, null);
      check(screenOf(s, 'AGK', d));
    }
    const d = newDraft();
    applyClick(s, 'AGK', d, 'gk', 'adiantar', null);
    expect(d.step).toMatchObject({ s: 'confirm', action: { kind: 'goleiro', posture: 'adiantar' } });
  });

  it('o painel de palpite do goleiro cabe e tem os 3 cantos', () => {
    const s = put(match(), { A1: { x: 8, y: 3 }, B1: { x: 3, y: 1 } }, 'A1', 'A1');
    const spec = guessScreen({ matchId: 'm-panel', state: s, shooterId: 'A1', keeperId: 'BGK', deadline });
    check(spec);
    const json = JSON.stringify(screen(spec).components.map((c) => c.toJSON()));
    expect((json.match(/"custom_id":"kg:/g) ?? []).length).toBe(3);
  });

  it('uma partida inteira de bots nunca gera um painel inválido', () => {
    let s = match('3v3');
    let n = 0;
    while (!s.finished && n++ < 400) {
      const a = turnos.currentActorId(s);
      check(screenOf(s, a, newDraft()));
      s = turnos.applyAction(s, a, turnos.chooseAction(s, a)).state;
    }
    expect(s.finished).toBe(true);
  });
});
