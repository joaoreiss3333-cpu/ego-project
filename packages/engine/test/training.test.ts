import { describe, expect, it } from 'vitest';
import { hintAccuracy, newDuelTraining, newPhysicalTraining, playDuelTraining, playPhysical, roundsSaved, TRAINING_ROUNDS } from '../src';
import { attrs } from '../src/testing';

describe('treinos', () => {
  it('drible: 5 rodadas, determinístico por seed', () => {
    const run = () => {
      let s = newDuelTraining('drible', 'seed', attrs({ drible: 7 }), 10);
      for (let i = 0; i < TRAINING_ROUNDS; i++) s = playDuelTraining(s, 'driblar');
      return s;
    };
    const a = run();
    expect(a.finished).toBe(true);
    expect(a.history).toHaveLength(5);
    expect(JSON.stringify(run())).toBe(JSON.stringify(a));
  });

  it('dica só aparece com Visão 6+', () => {
    expect(hintAccuracy(5)).toBe(0);
    expect(newDuelTraining('drible', 's', attrs({ visao: 5 }), 1).hint).toBeNull();
    expect(newDuelTraining('drible', 's', attrs({ visao: 8 }), 1).hint).not.toBeNull();
  });

  it('desarme: vencer o duelo conta acerto', () => {
    let s = newDuelTraining('desarme', 'x', attrs({ defesa: 40 }), 1);
    for (let i = 0; i < 5; i++) s = playDuelTraining(s, 'conter');
    expect(s.hits).toBe(5);
  });

  it('físico: chegar antes da 5ª rodada poupa rodadas; sem fôlego cai para poupar', () => {
    let s = newPhysicalTraining('p', attrs({ velocidade: 10, fisico: 40 }));
    for (let i = 0; i < 5 && !s.finished; i++) s = playPhysical(s, s.obstacles.findIndex((o) => !o), 'sprint');
    expect(s.completed).toBe(true);
    expect(roundsSaved(s)).toBeGreaterThan(0);
    let t = newPhysicalTraining('q', attrs());
    for (let i = 0; i < 4; i++) t = playPhysical(t, 1, 'sprint');
    expect(t.history.some((h) => h.pace === 'poupar')).toBe(true);
  });
});
