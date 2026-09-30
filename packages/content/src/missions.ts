import type { MissionDef } from './types';

export const DAILY_MISSIONS: MissionDef[] = [
  { id: 'd_leituras', name: 'Leitor', description: 'Acerte 3 Leituras.', kind: 'daily', metric: 'leitura_certa', target: 3, reward: { xp: 120, ienes: 150 } },
  { id: 'd_assist', name: 'Servir', description: 'Dê 2 assistências.', kind: 'daily', metric: 'assistencia', target: 2, reward: { xp: 120, ienes: 150 } },
  { id: 'd_treinos', name: 'Rotina', description: 'Faça 2 treinos.', kind: 'daily', metric: 'treino', target: 2, reward: { xp: 100, ienes: 120 } },
  { id: 'd_selecao', name: 'Seletiva', description: 'Vença 1 partida do Modo Seleção.', kind: 'daily', metric: 'vitoria_selecao', target: 1, reward: { xp: 150, ienes: 180 } },
  { id: 'd_dribles', name: 'Passagem', description: 'Vença 5 duelos de drible.', kind: 'daily', metric: 'drible_vencido', target: 5, reward: { xp: 120, ienes: 150 } },
  { id: 'd_gols', name: 'Faminto', description: 'Marque 2 gols.', kind: 'daily', metric: 'gol', target: 2, reward: { xp: 130, ienes: 160 } },
  { id: 'd_desarmes', name: 'Muro', description: 'Vença 3 duelos defendendo.', kind: 'daily', metric: 'desarme', target: 3, reward: { xp: 120, ienes: 150 } },
  { id: 'd_passes', name: 'Circulação', description: 'Acerte 8 passes.', kind: 'daily', metric: 'passe_certo', target: 8, reward: { xp: 100, ienes: 130 } },
  { id: 'd_partidas', name: 'Presença', description: 'Jogue 2 partidas.', kind: 'daily', metric: 'partida_jogada', target: 2, reward: { xp: 100, ienes: 120 } },
];

export const WEEKLY_MISSIONS: MissionDef[] = [
  { id: 'w_vitorias', name: 'Sobrevivente', description: 'Vença 5 partidas.', kind: 'weekly', metric: 'vitoria_partida', target: 5, reward: { xp: 600, ienes: 900 } },
  { id: 'w_gols', name: 'Artilheiro', description: 'Marque 10 gols.', kind: 'weekly', metric: 'gol', target: 10, reward: { xp: 600, ienes: 900 } },
  { id: 'w_treinos', name: 'Disciplina', description: 'Complete 12 treinos.', kind: 'weekly', metric: 'treino', target: 12, reward: { xp: 500, ienes: 800 } },
  { id: 'w_leituras', name: 'Olho Frio', description: 'Acerte 12 Leituras.', kind: 'weekly', metric: 'leitura_certa', target: 12, reward: { xp: 550, ienes: 850 } },
  { id: 'w_habilidades', name: 'Arsenal', description: 'Use habilidades com sucesso 20 vezes.', kind: 'weekly', metric: 'habilidade_usada', target: 20, reward: { xp: 500, ienes: 800 } },
  { id: 'w_selecao', name: 'Seletiva Longa', description: 'Vença 4 partidas do Modo Seleção.', kind: 'weekly', metric: 'vitoria_selecao', target: 4, reward: { xp: 650, ienes: 950 } },
];

/** Missões de Despertar: liberam nós especiais da árvore. */
export const AWAKENING_MISSIONS: MissionDef[] = [
  {
    id: 'despertar_isagi',
    name: 'Peça que Encaixa',
    description: 'Marque 15 gols de primeira com Isagi.',
    kind: 'awakening',
    metric: 'gol_de_primeira',
    target: 15,
    lineageId: 'isagi',
    reward: { xp: 500 },
  },
  {
    id: 'despertar_lavinho',
    name: 'Dança do Ego',
    description: 'Vença 50 dribles com Lavinho.',
    kind: 'awakening',
    metric: 'drible_vencido',
    target: 50,
    lineageId: 'lavinho',
    reward: { xp: 500 },
  },
];

export const ALL_MISSIONS: MissionDef[] = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS, ...AWAKENING_MISSIONS];

export function getMission(id: string): MissionDef {
  const m = ALL_MISSIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Missão desconhecida: ${id}`);
  return m;
}
