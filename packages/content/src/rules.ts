import type { AttrKey, MatchMode, Rarity } from './types';

/** Tamanho do campo por modo (largura x altura, em casas). */
export const FIELD_SIZES: Record<MatchMode, { width: number; height: number }> = {
  '1v1': { width: 11, height: 7 },
  '2v2': { width: 11, height: 7 },
  '3v3': { width: 11, height: 7 },
  '4v4': { width: 13, height: 8 },
  '5v5': { width: 15, height: 9 },
};

export const PLAYERS_PER_SIDE: Record<MatchMode, number> = {
  '1v1': 1,
  '2v2': 2,
  '3v3': 3,
  '4v4': 4,
  '5v5': 5,
};

export const MATCH_RULES = {
  goalWidth: 3,
  /** Colunas de profundidade da área do goleiro. */
  areaDepth: 2,
  /** A área cobre as linhas do gol mais esta quantidade para cada lado. */
  areaExtraRows: 1,
  halves: 2,
  turnsPerHalf: 8,
  quickFirstTo: 3,
  planSeconds: { default: 30, min: 20, max: 60 },
  reactionSeconds: 15,

  movement: { base: 2, velocityDivisor: 4, sprintBonus: 2 },
  stamina: { max: 100, regenPerTurn: 10, sprintCost: 15, boteCost: 5, lowThreshold: 20, lowPenalty: 1 },
  flow: {
    max: 100,
    dribbleWon: 20,
    readCorrect: 25,
    passToShot: 15,
    goal: 30,
    goalkeeperSave: 25,
  },
  duel: {
    matrixBonus: 2,
    protectBonus: 2,
    readBonus: 3,
    readRange: 3,
    readWrongInitiativePenalty: 1,
  },
  offBall: {
    desmarqueReceptionBonus: 2,
    desmarqueMarkerPenalty: 1,
    abrirLinhaInterceptPenalty: 2,
    corteLuzMovePenalty: 1,
    pedirBolaPassBonus: 1,
    pedirBolaChemistry: 1,
    fecharLinhaInterceptBonus: 3,
    spaceReceptionBonus: 2,
  },
  pass: {
    /** -1 a cada N casas acima de Passe / 2. */
    penaltyEvery: 3,
    /** Passe + d10 + mods abaixo disso sai torto. */
    astrayThreshold: 7,
  },
  shot: {
    freeDistance: 4,
    /** -1 a cada N casas acima da distância livre. */
    penaltyEvery: 2,
    defenderOnLinePenalty: 2,
    /** Ângulo fechado: -1 por linha fora da faixa do gol. */
    anglePenaltyPerRow: 1,
    keeperExactZone: 4,
    keeperAdjacentZone: 1,
  },
  goalkeeper: {
    /** Bônus de Defesa que o goleiro humano dá com Comandar. */
    commandBonus: 1,
    /** Bônus do goleiro na disputa de bola solta ao Sair do gol. */
    rushLooseBonus: 3,
    /** Adiantar linha: bônus para interceptar passes que cruzam a área, penalidade na defesa do chute. */
    advanceInterceptBonus: 2,
    advanceSavePenalty: 1,
  },
  /** Leitura do goleiro bot: peso extra na zona mais usada pelo chutador por ponto de Visão. */
  keeperBotVisionWeight: 0.12,
} as const;

export const RARITY_COST: Record<Rarity, number> = {
  comum: 1,
  rara: 2,
  epica: 3,
  lendaria: 4,
  mitica: 5,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  comum: 'Comum',
  rara: 'Rara',
  epica: 'Épica',
  lendaria: 'Lendária',
  mitica: 'Mítica',
};

/** Teto do orçamento de raridade por time na ranqueada (configurável por servidor). */
export const DEFAULT_RARITY_BUDGET: Record<MatchMode, number> = {
  '1v1': 5,
  '2v2': 7,
  '3v3': 11,
  '4v4': 14,
  '5v5': 17,
};

export const ATTR_LABEL: Record<AttrKey, string> = {
  velocidade: 'Velocidade',
  drible: 'Drible',
  passe: 'Passe',
  chute: 'Chute',
  fisico: 'Físico',
  visao: 'Visão',
  defesa: 'Defesa',
};

export const ATTR_SHORT: Record<AttrKey, string> = {
  velocidade: 'VEL',
  drible: 'DRI',
  passe: 'PAS',
  chute: 'CHU',
  fisico: 'FIS',
  visao: 'VIS',
  defesa: 'DEF',
};

export const PROGRESSION = {
  maxLevel: 50,
  attrStart: 3,
  attrMax: 10,
  /** Até este valor, subir custa só 1 Ponto de Atributo. */
  freeUpTo: 6,
  /** Fichas para chegar em N (N > freeUpTo) = (N - freeUpTo) * tokensPerStep. */
  tokensPerStep: 15,
  attributePointsPerLevel: 1,
  lineagePointEvery: 2,
  /** Equipamentos passam do teto em no máximo este valor. */
  equipmentOverCap: 1,
  reset: {
    attributesCost: 2000,
    treeCost: 3000,
    cooldownHours: 24,
  },
} as const;

/** XP para ir do nível `level` ao próximo. */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.35));
}

/** Fichas de Treino para subir o atributo até `target`. */
export function tokenCostForAttr(target: number): number {
  return target > PROGRESSION.freeUpTo ? (target - PROGRESSION.freeUpTo) * PROGRESSION.tokensPerStep : 0;
}

export const MASTERY = {
  thresholds: [10, 30, 75, 150, 300],
  labels: ['—', 'I', 'II', 'III', 'IV', 'V'],
  staminaReductionPerLevel: 2,
  /** A partir deste nível a seta e o efeito mudam no campo. */
  visualLevel: 3,
  /** Neste nível o nome ganha sufixo no log. */
  suffixLevel: 5,
  suffix: '— Maestria',
} as const;

export function masteryLevel(uses: number): number {
  let lvl = 0;
  for (const t of MASTERY.thresholds) if (uses >= t) lvl++;
  return lvl;
}

export const ENERGY = {
  max: 6,
  regenHours: 4,
  trainingCost: 1,
} as const;

export const GACHA = {
  cost: 160,
  rates: {
    comum: 0.55,
    rara: 0.3,
    epica: 0.115,
    lendaria: 0.03,
    mitica: 0.005,
  } as Record<Rarity, number>,
  /** Lendária ou melhor garantida em no máximo N giros sem uma. */
  pityLegendary: 60,
  /** Mítica garantida em no máximo N giros sem uma. */
  pityMythic: 200,
} as const;

export const MATCH_REWARDS = {
  /** Por lance com ação própria. */
  perActiveTurn: { xp: 6, ienes: 8 },
  goal: { xp: 40, ienes: 50 },
  assist: { xp: 30, ienes: 40, passTokens: 3 },
  readCorrect: { xp: 12, ienes: 10 },
  duelWon: { xp: 8, ienes: 6 },
  save: { xp: 20, ienes: 20 },
  win: { xp: 80, ienes: 120 },
  draw: { xp: 30, ienes: 50 },
  /** Fichas de Passe por passe certo. */
  passTokensPerCompletedPass: 1,
  maxPassTokensPerMatch: 12,
  rankedMultiplier: 1.2,
} as const;

export const ANTI_ABUSE = {
  /** Abaixo desta fração de lances com ação própria... */
  minActiveRatio: 0.6,
  /** ...recebe só isto da recompensa. */
  lowActivityMultiplier: 0.2,
  /** Retorno decrescente diário por partida. */
  dailyTiers: [
    { upTo: 5, multiplier: 1 },
    { upTo: 10, multiplier: 0.6 },
    { upTo: Infinity, multiplier: 0.25 },
  ],
  /** Mesmo grupo de jogadores em menos de N minutos... */
  repeatWindowMinutes: 60,
  /** ...a partir da N-ésima partida... */
  repeatFrom: 3,
  /** ...rende isto. */
  repeatMultiplier: 0.5,
  /** Limite de comandos por usuário. */
  rateLimit: { windowSeconds: 10, maxCommands: 6 },
} as const;

export const MMR = {
  start: 1000,
  kFactor: 32,
  /** Diferença máxima de MMR tentada na fila antes de abrir a busca. */
  queueInitialRange: 100,
  queueRangeGrowthPerMinute: 75,
} as const;

export type RankGroup = 'solo' | 'time';
export function rankGroupForMode(mode: MatchMode): RankGroup {
  return mode === '1v1' || mode === '2v2' ? 'solo' : 'time';
}

export const MARKET_VALUE = {
  start: 1_000_000,
  goal: 45_000,
  assist: 30_000,
  win: 60_000,
  mvp: 80_000,
  /** Queda por dia sem jogar, em fração. */
  inactivityDecayPerDay: 0.01,
  /** A queda começa depois de N dias parado. */
  inactivityGraceDays: 3,
  floor: 250_000,
} as const;

export const TRAINING_REWARDS = {
  drible: { tokensPerHit: 3, xp: 25, ienes: 40 },
  desarme: { tokensPerHit: 3, xp: 25, ienes: 40 },
  fisico: { tokensBase: 4, tokensBonusPerRoundSaved: 3, xp: 25, ienes: 40 },
  '1v1': { xpWin: 80, xpLoss: 35, ienes: 60, tokensPerGoal: 4, visionTokensBase: 3 },
} as const;

export const MISSION_COIN_BONUS = {
  /** Por completar as 3 diárias do dia. */
  allDaily: 5,
  /** Por completar as 3 semanais. */
  allWeekly: 25,
  dailyCount: 3,
  weeklyCount: 3,
} as const;

export const SELECTION_RULES = {
  /** Fração da recompensa fixa nas repetições (quando a etapa não define). */
  repeatFraction: 0.3,
} as const;
