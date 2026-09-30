import { MATCH_RULES, type Attrs } from '@ego/content';
import { duelMatrix } from './resolve';
import { Rng, type RngState } from './rng';

/**
 * Treinos rápidos: no máximo 5 rodadas, só botões, resultado imediato.
 * Tudo aqui é puro e determinístico por seed; o servidor guarda o estado.
 */

export const TRAINING_ROUNDS = 5;

export type DribbleChoice = 'driblar' | 'proteger' | 'passar';
export type DefenseChoice = 'bote' | 'conter' | 'fechar_linha';

export interface DuelTrainingState {
  kind: 'drible' | 'desarme';
  rng: RngState;
  round: number;
  hits: number;
  playerAttrs: Attrs;
  /** Nível do bot adversário (atributo relevante). */
  botStat: number;
  /** Tendência do bot (pesos das escolhas), sorteada no início. */
  botWeights: number[];
  /** Dica visível nesta rodada (Visão alta). */
  hint: string | null;
  /** Escolha secreta do bot nesta rodada. */
  botChoice: string;
  history: { player: string; bot: string; win: boolean; atk: number; def: number }[];
  finished: boolean;
}

const DEF_CHOICES: DefenseChoice[] = ['bote', 'conter', 'fechar_linha'];
const ATK_CHOICES: DribbleChoice[] = ['driblar', 'proteger', 'passar'];

/** Visão 6+ mostra uma inclinação do bot; quanto mais Visão, mais confiável. */
export function hintAccuracy(visao: number): number {
  if (visao < 6) return 0;
  return Math.min(0.9, 0.5 + 0.05 * visao);
}

function nextBotChoice(s: DuelTrainingState, rng: Rng) {
  const opts = s.kind === 'drible' ? DEF_CHOICES : ATK_CHOICES;
  s.botChoice = rng.weighted(opts, s.botWeights);
  const acc = hintAccuracy(s.playerAttrs.visao);
  if (acc > 0) {
    const right = rng.next() < acc;
    s.hint = right ? s.botChoice : rng.pick(opts.filter((o) => o !== s.botChoice));
  } else s.hint = null;
}

export function newDuelTraining(kind: 'drible' | 'desarme', seed: string, playerAttrs: Attrs, level: number): DuelTrainingState {
  const rng = new Rng(seed);
  const s: DuelTrainingState = {
    kind,
    rng: rng.state(),
    round: 1,
    hits: 0,
    playerAttrs,
    botStat: Math.min(10, 3 + Math.floor(level / 5)),
    botWeights: [0, 1, 2].map(() => 0.5 + rng.next()),
    hint: null,
    botChoice: '',
    history: [],
    finished: false,
  };
  nextBotChoice(s, rng);
  s.rng = rng.state();
  return s;
}

/** Resolve uma rodada pela matriz de duelo. */
export function playDuelTraining(prev: DuelTrainingState, choice: string): DuelTrainingState {
  if (prev.finished) return prev;
  const s: DuelTrainingState = JSON.parse(JSON.stringify(prev));
  const rng = new Rng(s.rng);
  const b = MATCH_RULES.duel.matrixBonus;
  let atk: number;
  let def: number;
  let win: boolean;
  if (s.kind === 'drible') {
    const c = choice as DribbleChoice;
    const carrierAction = c === 'passar' ? 'passe_pe' : c;
    let [am, dm] = duelMatrix(carrierAction, s.botChoice);
    if (c === 'passar' && s.botChoice === 'fechar_linha') dm += b;
    const stat = c === 'driblar' ? s.playerAttrs.drible : c === 'proteger' ? s.playerAttrs.fisico + MATCH_RULES.duel.protectBonus : s.playerAttrs.passe;
    atk = stat + rng.d10() + am;
    def = s.botStat + rng.d10() + dm;
    win = atk > def;
  } else {
    const c = choice as DefenseChoice;
    const carrierAction = s.botChoice === 'passar' ? 'passe_pe' : s.botChoice;
    let [am, dm] = duelMatrix(carrierAction, c);
    if (s.botChoice === 'passar' && c === 'fechar_linha') dm += b;
    const botStat = s.botChoice === 'proteger' ? s.botStat + MATCH_RULES.duel.protectBonus : s.botStat;
    atk = botStat + rng.d10() + am;
    def = s.playerAttrs.defesa + rng.d10() + dm;
    win = def >= atk;
  }
  s.history.push({ player: choice, bot: s.botChoice, win, atk, def });
  if (win) s.hits++;
  if (s.round >= TRAINING_ROUNDS) s.finished = true;
  else {
    s.round++;
    nextBotChoice(s, rng);
  }
  s.rng = rng.state();
  return s;
}

// ---------------------------------------------------------------------------
// Treino físico
// ---------------------------------------------------------------------------

export type Pace = 'sprint' | 'ritmo' | 'poupar';

export const PHYSICAL = {
  trackLength: 14,
  lanes: 3,
  pace: {
    sprint: { advance: 4, cost: 30 },
    ritmo: { advance: 3, cost: 10 },
    poupar: { advance: 2, cost: -15 },
  },
  obstacleCheck: 10,
} as const;

export interface PhysicalState {
  rng: RngState;
  round: number;
  distance: number;
  stamina: number;
  lane: number;
  /** Obstáculos por faixa nesta rodada. */
  obstacles: boolean[];
  playerAttrs: Attrs;
  history: { lane: number; pace: Pace; advance: number; obstacle: boolean; cleared: boolean }[];
  finished: boolean;
  completed: boolean;
}

function rollObstacles(rng: Rng): boolean[] {
  const out = [false, false, false];
  out[rng.int(0, 2)] = true;
  if (rng.next() < 0.4) out[rng.int(0, 2)] = true;
  return out;
}

export function newPhysicalTraining(seed: string, playerAttrs: Attrs): PhysicalState {
  const rng = new Rng(seed);
  const s: PhysicalState = { rng: rng.state(), round: 1, distance: 0, stamina: 100, lane: 1, obstacles: rollObstacles(rng), playerAttrs, history: [], finished: false, completed: false };
  s.rng = rng.state();
  return s;
}

export function canUsePace(s: PhysicalState, pace: Pace): boolean {
  const cost = PHYSICAL.pace[pace].cost;
  return cost <= 0 || s.stamina >= cost;
}

export function playPhysical(prev: PhysicalState, lane: number, pace: Pace): PhysicalState {
  if (prev.finished) return prev;
  const s: PhysicalState = JSON.parse(JSON.stringify(prev));
  const rng = new Rng(s.rng);
  const p = canUsePace(s, pace) ? pace : 'poupar';
  let advance: number = PHYSICAL.pace[p].advance + (p === 'sprint' && s.playerAttrs.velocidade >= 7 ? 1 : 0);
  s.stamina = Math.max(0, Math.min(100, s.stamina - PHYSICAL.pace[p].cost));
  const obstacle = s.obstacles[lane] ?? false;
  let cleared = true;
  if (obstacle) {
    cleared = s.playerAttrs.fisico + rng.d10() >= PHYSICAL.obstacleCheck;
    advance = cleared ? advance - 1 : 1;
  }
  s.lane = lane;
  s.distance += advance;
  s.history.push({ lane, pace: p, advance, obstacle, cleared });
  if (s.distance >= PHYSICAL.trackLength) {
    s.finished = true;
    s.completed = true;
  } else if (s.round >= TRAINING_ROUNDS) s.finished = true;
  else {
    s.round++;
    s.obstacles = rollObstacles(rng);
  }
  s.rng = rng.state();
  return s;
}

/** Rodadas poupadas ao terminar antes da quinta. */
export function roundsSaved(s: PhysicalState): number {
  return s.completed ? TRAINING_ROUNDS - s.history.length : 0;
}
