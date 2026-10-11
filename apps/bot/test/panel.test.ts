import { describe, expect, it } from 'vitest';
import { SELECTION_GROUPS, getStage } from '@ego/content';
import type { Character } from '@ego/db';
import { lobbySpec, type Lobby } from '../src/match/lobby';
import { autoTurn, botSlot, buildSetup, createMatch, keeperSlot, legalActions, type MatchState, type SlotSetup } from '@ego/engine';
import { __tutorial, quickHelpScreen } from '../src/features/tutorial';
import { applyClick, newDraft, panelScreen, reachFor, stepsOf, type Draft } from '../src/match/panel';
import { MAX_COMPONENTS, countComponents, edit, type ScreenSpec } from '../src/ui';

/** Valida como o Discord: builders.toJSON() (limites de texto) + limite de componentes. */
function check(spec: ScreenSpec) {
  expect(countComponents(spec)).toBeLessThanOrEqual(MAX_COMPONENTS);
  const p = edit(spec);
  // Components V2: no máximo 4000 caracteres de texto somando a mensagem inteira
  const all = JSON.stringify(p.components.map((c) => c.toJSON()));
  const texts = [...all.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
  expect(texts.reduce((a, t) => a + t.length, 0)).toBeLessThanOrEqual(4000);
  for (const c of p.components) {
    const json = c.toJSON();
    const walk = (x: unknown) => {
      if (!x || typeof x !== 'object') return;
      const o = x as Record<string, unknown>;
      if (typeof o.custom_id === 'string') expect(o.custom_id.length).toBeLessThanOrEqual(100);
      if (o.type === 2 && typeof o.label === 'string') expect(o.label.length).toBeGreaterThan(0);
      // menu de seleção vazio é rejeitado pela API
      if (o.type === 3) expect((o.options as unknown[]).length).toBeGreaterThan(0);
      if (o.type === 1) expect((o.components as unknown[]).length).toBeGreaterThan(0);
      for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(walk);
    };
    walk(json);
  }
}

function match3v3(seed: string): MatchState {
  const lin = ['isagi', 'chigiri', 'lavinho', 'gagamaru', 'kuon', 'isagi'];
  const slots: SlotSetup[] = [];
  for (const t of ['A', 'B'] as const) {
    for (let i = 0; i < 3; i++) slots.push(botSlot({ name: `${t} Jogador ${i + 1}`, lineageId: lin[i + (t === 'B' ? 3 : 0)], level: 20, personality: 'coletivo', position: 'atacante' }, `${t}${i + 1}`, t, 'regular'));
    slots.push(keeperSlot(`${t}GK`, t, 20));
  }
  let s = createMatch(buildSetup({ id: 'painel', seed, mode: '3v3', kind: 'simulacao', slots }));
  for (let i = 0; i < 3; i++) s = autoTurn(s, { botIds: slots.map((x) => x.id) }).result.state;
  return s;
}

describe('painel de planejamento em etapas', () => {
  it('toda ação de todo jogador passa pelas etapas dentro dos limites do Discord', () => {
    const state = match3v3('etapas');
    for (const id of state.order) {
      for (const a of legalActions(state, id)) {
        const d: Draft = newDraft(state, id);
        check(panelScreen({ matchId: 'mteste', state, slotId: id, draft: d, mode: 'plan', deadline: Date.now() + 30_000 }));
        applyClick(state, id, d, 'act', undefined, [a]);
        const steps = stepsOf(state, id, d, { allowDest: true, allowAction: true });
        expect(d.step).toBe(steps[1]);
        for (const step of steps) {
          d.step = step;
          check(panelScreen({ matchId: 'mteste', state, slotId: id, draft: d, mode: 'plan', deadline: Date.now() + 30_000 }));
        }
      }
    }
  });

  it('as setas só andam dentro do alcance e os extras mantêm o destino válido', () => {
    const state = match3v3('setas');
    const id = state.ball.holder ?? 'A1';
    const d = newDraft(state, id);
    applyClick(state, id, d, 'act', undefined, [state.players[id].isKeeper ? 'passe_pe' : 'conduzir']);
    // anda para a direita até bater no limite
    for (let k = 0; k < 20; k++) applyClick(state, id, d, 'mv', '1,0', null);
    const reach = reachFor(state, id, d);
    expect(reach.some((c) => c.x === d.dest!.x && c.y === d.dest!.y)).toBe(true);
    expect(d.error).toBeTruthy();
    // sprint liga e desliga: o destino continua alcançável
    applyClick(state, id, d, 'sprint', undefined, null);
    for (let k = 0; k < 20; k++) applyClick(state, id, d, 'mv', '1,0', null);
    applyClick(state, id, d, 'sprint', undefined, null);
    expect(reachFor(state, id, d).some((c) => c.x === d.dest!.x && c.y === d.dest!.y)).toBe(true);
    // ficar volta para a própria casa
    applyClick(state, id, d, 'stay', undefined, null);
    expect(d.dest).toEqual(state.players[id].pos);
  });

  it('não confirma sem o alvo e confirma depois dele', () => {
    const state = match3v3('alvo');
    const id = state.ball.holder!;
    const d = newDraft(state, id);
    const passes = legalActions(state, id).includes('passe_pe');
    expect(passes).toBe(true);
    applyClick(state, id, d, 'act', undefined, ['passe_pe']);
    expect(applyClick(state, id, d, 'ok', undefined, null)).toBe('update');
    expect(d.error).toMatch(/companheiro/);
    const ally = state.order.find((x) => x !== id && state.players[x].team === state.players[id].team && !state.players[x].isKeeper)!;
    applyClick(state, id, d, 'tgt', ally, null);
    expect(applyClick(state, id, d, 'ok', undefined, null)).toBe('confirm');
  });
});

describe('tutorial', () => {
  it('todas as páginas e treinos cabem nos limites e os treinos resolvem', () => {
    const { PAGES, LESSONS, newTutorial, tutorialScreen, goTo, playLesson } = __tutorial;
    const t = newTutorial('123456789012345678', 'Tester');
    for (let p = 0; p < PAGES.length; p++) {
      goTo(t, p);
      check(tutorialScreen(t));
      if (!t.lesson) continue;
      // passa por todas as etapas de cada ação possível no treino
      const { state, you } = t.lesson.scenario;
      for (const a of legalActions(state, you)) {
        t.lesson.draft = newDraft(state, you);
        applyClick(state, you, t.lesson.draft, 'act', undefined, [a]);
        for (const step of stepsOf(state, you, t.lesson.draft, { allowDest: true, allowAction: true })) {
          t.lesson.draft.step = step;
          check(tutorialScreen(t));
        }
      }
      // jogada "certa" de cada treino
      const L = LESSONS[t.lesson.index];
      const d = (t.lesson.draft = newDraft(state, you));
      const right = ['conduzir', 'chutar', 'passe_pe', 'driblar', 'conter'][t.lesson.index];
      applyClick(state, you, d, 'act', undefined, [right]);
      if (L.mark) d.dest = { ...L.mark };
      if (right === 'chutar') applyClick(state, you, d, 'zone', '5', null);
      if (right === 'passe_pe') applyClick(state, you, d, 'tgt', 'A2', null);
      if (right === 'driblar') applyClick(state, you, d, 'mv', '1,-1', null);
      expect(applyClick(state, you, d, 'ok', undefined, null)).toBe('confirm');
      playLesson(t);
      expect(t.lesson.result).toBeTruthy();
      // o treino 1 é determinístico: sem adversário por perto, chega na casa
      if (t.lesson.index === 0) expect(t.lesson.result!.ok).toBe(true);
      check(tutorialScreen(t));
    }
  });

  it('ajuda rápida da partida', () => {
    check(quickHelpScreen('123456789012345678'));
  });
});

describe('lobby', () => {
  it('telas de lobby (casual, ranqueada e Modo Seleção) cabem nos limites', () => {
    const char = (n: number) => ({ id: `c${n}`, lineageId: 'isagi', name: `Jogador ${n}`, number: n, level: 5 }) as unknown as Character;
    const users = ['111111111111111111', '222222222222222222', '333333333333333333', '444444444444444444', '555555555555555555', '666666666666666666'];
    const stage = getStage(SELECTION_GROUPS[0].stages[0].id)!;
    for (const kind of ['casual', 'ranqueada', 'selecao'] as const) {
      for (const mode of ['1v1', '5v5'] as const) {
        const n = Number(mode[0]);
        const l: Lobby = {
          id: 'abcd1234',
          guildId: 'g',
          channel: null as never,
          hostId: users[0],
          mode,
          kind,
          stage: kind === 'selecao' ? stage : null,
          teams: { A: users.slice(0, Math.min(n, 3)), B: kind === 'selecao' ? [] : users.slice(3, 3 + Math.min(n, 3)) },
          keepers: { A: null, B: null },
          ready: new Set([users[0]]),
          quick: false,
          chars: new Map(users.map((u, i) => [u, char(i + 1)])),
          budget: 20,
          message: null,
          createdAt: Date.now(),
        };
        check(lobbySpec(l));
      }
    }
  });
});
