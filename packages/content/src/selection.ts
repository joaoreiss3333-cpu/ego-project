import type { SelectionGroup, SelectionStage } from './types';

/**
 * Modo Seleção. Para adicionar a Terceira Seleção, acrescente um grupo nesta lista.
 * Orçamento de raridade: Comum 1, Rara 2, Épica 3, Lendária 4, Mítica 5.
 */
export const SELECTION_GROUPS: SelectionGroup[] = [
  {
    id: 'primeira',
    name: 'Primeira Seleção',
    description: 'Três avaliações individuais e um teste em dupla. Quem não passa, volta para casa.',
    completionCosmetic: 'moldura_grade',
    stages: [
      {
        id: 'p1',
        name: 'Avaliação 01',
        subtitle: 'Um contra um. Mostre que existe.',
        mode: '1v1',
        difficulty: 'novato',
        boss: false,
        rarityBudget: 1,
        opponents: [{ name: 'Candidato 207', lineageId: 'kuon', level: 3, personality: 'cauteloso', position: 'meio' }],
        firstReward: { xp: 200, ienes: 300, tokens: { drible: 5 } },
        repeatReward: { xp: 60, ienes: 90 },
        dropChance: 0.15,
        dropItem: 'chuteira_trava_rapida',
        rules: { turnsPerHalf: 6, halves: 2, firstTo: 2 },
      },
      {
        id: 'p2',
        name: 'Avaliação 02',
        subtitle: 'Ele é maior. Seja mais rápido.',
        mode: '1v1',
        difficulty: 'regular',
        boss: false,
        rarityBudget: 2,
        opponents: [{ name: 'Candidato 118', lineageId: 'gagamaru', level: 6, personality: 'agressivo', position: 'defensor' }],
        firstReward: { xp: 260, ienes: 380, tokens: { defesa: 5 } },
        repeatReward: { xp: 80, ienes: 110 },
        dropChance: 0.15,
        dropItem: 'chuteira_trava_rapida',
        rules: { turnsPerHalf: 6, halves: 2, firstTo: 2 },
      },
      {
        id: 'p3',
        name: 'Avaliação 03',
        subtitle: 'A ponta é dele. Tome.',
        mode: '1v1',
        difficulty: 'elite',
        boss: false,
        rarityBudget: 3,
        opponents: [{ name: 'Candidato 051', lineageId: 'chigiri', level: 9, personality: 'egoista', position: 'atacante' }],
        firstReward: { xp: 320, ienes: 460, tokens: { velocidade: 5 } },
        repeatReward: { xp: 100, ienes: 140 },
        dropChance: 0.15,
        dropItem: 'chuteira_trava_rapida',
        rules: { turnsPerHalf: 6, halves: 2, firstTo: 2 },
      },
      {
        id: 'p_boss',
        name: 'Chefe: Dupla Vermelha',
        subtitle: 'Kaito Ren e Oda Shin. Nunca perderam juntos.',
        mode: '2v2',
        difficulty: 'chefe',
        boss: true,
        rarityBudget: 5,
        opponents: [
          { name: 'Kaito Ren', lineageId: 'chigiri', level: 12, personality: 'egoista', position: 'atacante' },
          { name: 'Oda Shin', lineageId: 'gagamaru', level: 12, personality: 'cauteloso', position: 'defensor' },
        ],
        firstReward: { xp: 600, ienes: 900, coins: 20, tokens: { chute: 8, visao: 8 } },
        repeatReward: { xp: 180, ienes: 260 },
        dropChance: 0.25,
        dropItem: 'caneleira_reforcada',
        rules: { turnsPerHalf: 8, halves: 2 },
      },
    ],
  },
  {
    id: 'segunda',
    name: 'Segunda Seleção',
    description: 'Times de três. Ou você cabe no time, ou o time te engole.',
    stages: [
      {
        id: 's1',
        name: 'Rodada 01',
        subtitle: 'Três contra três. Ninguém joga sozinho.',
        mode: '3v3',
        difficulty: 'regular',
        boss: false,
        rarityBudget: 6,
        opponents: [
          { name: 'Hayato Kiri', lineageId: 'kuon', level: 14, personality: 'agressivo', position: 'meio' },
          { name: 'Goro Mine', lineageId: 'gagamaru', level: 14, personality: 'cauteloso', position: 'defensor' },
          { name: 'Sen Aoba', lineageId: 'chigiri', level: 14, personality: 'egoista', position: 'atacante' },
        ],
        firstReward: { xp: 450, ienes: 650, tokens: { passe: 6 } },
        repeatReward: { xp: 140, ienes: 200 },
        dropChance: 0.15,
        dropItem: 'chuteira_trava_rapida',
        rules: { turnsPerHalf: 8, halves: 2 },
      },
      {
        id: 's2',
        name: 'Rodada 02',
        subtitle: 'Eles leem. Seja ilegível.',
        mode: '3v3',
        difficulty: 'elite',
        boss: false,
        rarityBudget: 8,
        opponents: [
          { name: 'Rui Tsuge', lineageId: 'isagi', level: 18, personality: 'coletivo', position: 'atacante' },
          { name: 'Daigo Hama', lineageId: 'gagamaru', level: 18, personality: 'cauteloso', position: 'defensor' },
          { name: 'Tomo Ise', lineageId: 'kuon', level: 18, personality: 'agressivo', position: 'meio' },
        ],
        firstReward: { xp: 550, ienes: 800, tokens: { visao: 6 } },
        repeatReward: { xp: 170, ienes: 240 },
        dropChance: 0.15,
        dropItem: 'chuteira_trava_rapida',
        rules: { turnsPerHalf: 8, halves: 2 },
      },
      {
        id: 's_boss',
        name: 'Chefe: Trio do Topo',
        subtitle: 'Número 1, 2 e 3 da instalação. Você é o próximo?',
        mode: '3v3',
        difficulty: 'chefe',
        boss: true,
        rarityBudget: 11,
        opponents: [
          { name: 'Ren Amagi', lineageId: 'lavinho', level: 24, personality: 'egoista', position: 'atacante' },
          { name: 'Kyo Sagara', lineageId: 'chigiri', level: 24, personality: 'coletivo', position: 'meio' },
          { name: 'Taiga Mori', lineageId: 'gagamaru', level: 24, personality: 'cauteloso', position: 'defensor' },
        ],
        firstReward: { xp: 900, ienes: 1400, coins: 40, tokens: { chute: 10, drible: 10 } },
        repeatReward: { xp: 260, ienes: 380 },
        dropChance: 0.3,
        dropItem: 'caneleira_reforcada',
        rules: { turnsPerHalf: 8, halves: 2 },
      },
    ],
  },
];

export function allStages(): (SelectionStage & { groupId: string })[] {
  return SELECTION_GROUPS.flatMap((g) => g.stages.map((s) => ({ ...s, groupId: g.id })));
}

export function getStage(id: string) {
  const s = allStages().find((x) => x.id === id);
  if (!s) throw new Error(`Etapa desconhecida: ${id}`);
  return s;
}

/** Etapa liberada se a anterior (na ordem global) foi vencida. */
export function isStageUnlocked(stageId: string, clearedStageIds: string[]): boolean {
  const list = allStages();
  const idx = list.findIndex((s) => s.id === stageId);
  if (idx <= 0) return idx === 0;
  return clearedStageIds.includes(list[idx - 1].id);
}
