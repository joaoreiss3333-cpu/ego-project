import type { Difficulty, Personality } from '@ego/content';

export interface DifficultyProfile {
  /** Temperatura do softmax: alta = mais erros plausíveis. */
  temperature: number;
  /** Chance de o coordenador ativar um combo quando as pré-condições batem. */
  comboChance: number;
  /** Dificuldades mínimas de combo aceitas. */
  comboTiers: Difficulty[];
  /** Combos da linhagem (dicas combosWith). */
  lineageCombos: boolean;
  /** Leitura do adversário. */
  reading: 'off' | 'shallow' | 'full';
  /** Janela de lances considerada na leitura superficial. */
  readingWindow: number;
  /** Força do "chute inicial" das tendências: menor = aprende mais rápido. */
  prior: number;
  /** Qualidade do uso de habilidades (multiplica o valor). */
  skillQuality: number;
  /** Usa bônus contextuais das dicas (bonusIf). */
  skillContext: boolean;
  /** Limiar de valor para gastar Flow (menor = gasta mais cedo). */
  flowThreshold: number;
  /** Mistura de estratégia contra padrões (0..1). */
  mixing: number;
  /** Candidatos avaliados por bot (corte antes de pontuar). */
  destCap: number;
  /** Diferença máxima para o melhor antes de descartar (evita erros absurdos). */
  plausibleWindow: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  novato: {
    temperature: 4.5,
    comboChance: 0.25,
    comboTiers: ['novato'],
    lineageCombos: false,
    reading: 'off',
    readingWindow: 0,
    prior: 99,
    skillQuality: 0.5,
    skillContext: false,
    flowThreshold: 3,
    mixing: 0,
    destCap: 5,
    plausibleWindow: 10,
  },
  regular: {
    temperature: 2.5,
    comboChance: 0.55,
    comboTiers: ['novato', 'regular'],
    lineageCombos: false,
    reading: 'shallow',
    readingWindow: 6,
    prior: 6,
    skillQuality: 0.8,
    skillContext: true,
    flowThreshold: 4.5,
    mixing: 0.3,
    destCap: 8,
    plausibleWindow: 8,
  },
  elite: {
    temperature: 1.0,
    comboChance: 0.8,
    comboTiers: ['novato', 'regular', 'elite'],
    lineageCombos: false,
    reading: 'full',
    readingWindow: 999,
    prior: 4,
    skillQuality: 1,
    skillContext: true,
    flowThreshold: 5,
    mixing: 0.6,
    destCap: 10,
    plausibleWindow: 6,
  },
  chefe: {
    temperature: 0.15,
    comboChance: 0.95,
    comboTiers: ['novato', 'regular', 'elite', 'chefe'],
    lineageCombos: true,
    reading: 'full',
    readingWindow: 999,
    prior: 3,
    skillQuality: 1.15,
    skillContext: true,
    flowThreshold: 3.5,
    mixing: 0.7,
    destCap: 14,
    plausibleWindow: 4,
  },
};

export interface PersonalityWeights {
  shoot: number;
  dribble: number;
  pass: number;
  protect: number;
  press: number;
  contain: number;
  combo: number;
  /** Peso do custo de fôlego. */
  stamina: number;
  /** Aversão a perder a bola. */
  risk: number;
}

export const PERSONALITY: Record<Personality, PersonalityWeights> = {
  egoista: { shoot: 1.3, dribble: 1.25, pass: 0.85, protect: 0.9, press: 1, contain: 0.95, combo: 0.75, stamina: 0.9, risk: 0.85 },
  coletivo: { shoot: 0.95, dribble: 0.85, pass: 1.25, protect: 1, press: 1, contain: 1, combo: 1.35, stamina: 1, risk: 1 },
  agressivo: { shoot: 1.1, dribble: 1.1, pass: 0.95, protect: 0.85, press: 1.35, contain: 0.85, combo: 1, stamina: 0.75, risk: 0.8 },
  cauteloso: { shoot: 0.9, dribble: 0.8, pass: 1.05, protect: 1.3, press: 0.85, contain: 1.3, combo: 1, stamina: 1.6, risk: 1.35 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['novato', 'regular', 'elite', 'chefe'];
