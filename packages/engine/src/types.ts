import type {
  ActionKind,
  Attrs,
  Difficulty,
  GoalZone,
  MatchMode,
  Personality,
  Position,
  ReadGuess,
} from '@ego/content';
import type { Cell, FieldDims } from './grid';
import type { RngState } from './rng';

export type Team = 'A' | 'B';
export const otherTeam = (t: Team): Team => (t === 'A' ? 'B' : 'A');

export type MatchKind = 'casual' | 'ranqueada' | 'selecao' | 'treino' | 'simulacao';

export interface SlotSetup {
  /** Identificador estável do jogador na partida (ex.: "A1", "AGK"). */
  id: string;
  team: Team;
  isKeeper: boolean;
  name: string;
  number: number;
  /** Personagem do banco (null para bots). */
  characterId: string | null;
  /** Controlado pela IA desde o início. */
  isBot: boolean;
  position: Position;
  lineageId: string;
  level: number;
  /** Atributos já com equipamento. */
  attrs: Attrs;
  /** Nós da árvore comprados (para evoluções). */
  nodes: string[];
  loadout: { active: string[]; flow: string | null };
  /** Usos por habilidade (maestria). */
  mastery: Record<string, number>;
  personality: Personality;
  difficulty: Difficulty;
  /** Visual. */
  color: string;
  frameId?: string | null;
  trailId?: string | null;
  titleId?: string | null;
}

export interface MatchSetup {
  id: string;
  seed: string;
  mode: MatchMode;
  kind: MatchKind;
  field: FieldDims;
  halves: number;
  turnsPerHalf: number;
  /** Primeiro a N gols encerra. */
  firstTo: number | null;
  slots: SlotSetup[];
}

export type StatusKind =
  | 'vendido'
  | 'caido'
  | 'all_plus'
  | 'zone_radius'
  | 'ego_awake'
  | 'perfect_ginga'
  | 'rhythm_active'
  | 'read_wrong'
  | 'desmarcado';

export interface Status {
  kind: StatusKind;
  /** Lance global inicial (inclusive). */
  from: number;
  /** Lance global final (inclusive). */
  until: number;
  value?: number;
  data?: Record<string, number>;
}

export interface PlayerStats {
  goals: number;
  goalsOneTouch: number;
  assists: number;
  shots: number;
  passesAttempted: number;
  passesCompleted: number;
  dribblesWon: number;
  dribblesLost: number;
  duelsWon: number;
  duelsLost: number;
  tackles: number;
  interceptions: number;
  readsCorrect: number;
  readsWrong: number;
  saves: number;
  /** Lances em que o próprio jogador escolheu a ação. */
  activeTurns: number;
  totalTurns: number;
  /** Usos bem-sucedidos por habilidade. */
  skillUses: Record<string, number>;
  flowActivations: number;
  askedPassesAnswered: number;
  tabelas: number;
}

export interface PlayerState {
  id: string;
  team: Team;
  isKeeper: boolean;
  pos: Cell;
  stamina: number;
  flow: number;
  ego: number;
  chem: number;
  cooldowns: Record<string, number>;
  statuses: Status[];
  /** Acúmulos de Ritmo (Lavinho). */
  rhythm: number;
  lastDuel: { opponent: string; turn: number } | null;
  lastSkill: { skillId: string; turn: number } | null;
  stats: PlayerStats;
}

export interface Plan {
  playerId: string;
  dest: Cell;
  action: ActionKind;
  /** Alvo: aliado do passe, parceiro da tabela, atacante marcado, adversário do corta-luz, aliado comandado. */
  targetPlayer?: string | null;
  /** Casa do passe no espaço. */
  targetCell?: Cell | null;
  shotZone?: GoalZone | null;
  keeperZone?: GoalZone | null;
  readGuess?: ReadGuess | null;
  skill?: string | null;
  /** Alvo da habilidade (Cobertura). */
  skillTarget?: string | null;
  useFlow?: boolean;
  sprint?: boolean;
  /** Plano escolhido pela IA (AFK ou bot). */
  auto?: boolean;
}

export type PlanMap = Record<string, Plan>;

export interface Trail {
  team: Team;
  owner: string;
  cells: Cell[];
  until: number;
}

export interface BallState {
  holder: string | null;
  pos: Cell;
}

/** Plano revelado depois da resolução (público). */
export interface RevealedPlan {
  playerId: string;
  action: ActionKind;
  from: Cell;
  dest: Cell;
  shotZone?: GoalZone | null;
  keeperZone?: GoalZone | null;
  readGuess?: ReadGuess | null;
  targetPlayer?: string | null;
  skill?: string | null;
  usedFlow?: boolean;
  /** Situação no início do lance, para a leitura de tendências. */
  context: 'carrier' | 'carrier_contact' | 'attack' | 'defense' | 'keeper' | 'loose';
  hadBall: boolean;
}

export interface TurnHistory {
  turn: number;
  plans: RevealedPlan[];
  events: MatchEvent[];
}

export interface MatchState {
  setup: MatchSetup;
  /** Lance global atual (começa em 1). */
  turn: number;
  half: number;
  turnInHalf: number;
  score: Record<Team, number>;
  ball: BallState;
  players: Record<string, PlayerState>;
  /** Ordem estável dos jogadores. */
  order: string[];
  rng: RngState;
  trails: Trail[];
  /** Para assistências: último passe completado. */
  lastPass: { passer: string; receiver: string; turn: number } | null;
  kickoffTeam: Team;
  history: TurnHistory[];
  finished: boolean;
  winner: Team | 'draw' | null;
}

export type DuelKind = 'drible' | 'protecao' | 'passe' | 'conducao' | 'cobertura' | 'chute';

/** Uma parcela de uma rolagem (atributo, dado, bônus), para explicar o resultado ao jogador. */
export interface RollPart {
  label: string;
  value: number;
}

export type MatchEvent =
  | {
      t: 'duel';
      step: number;
      attacker: string;
      defender: string;
      kind: DuelKind;
      atk: number;
      def: number;
      winner: 'atk' | 'def';
      skill?: string | null;
      /** Ações dos dois no duelo e a conta de cada lado (a soma dá atk/def). */
      atkAction?: ActionKind;
      defAction?: ActionKind;
      atkParts?: RollPart[];
      defParts?: RollPart[];
    }
  | { t: 'steal'; step: number; from: string; to: string }
  | {
      t: 'pass';
      from: string;
      to: string | null;
      cell: Cell;
      kind: 'pe' | 'espaco' | 'tabela';
      roll: number;
      result: 'ok' | 'intercepted' | 'astray' | 'loose' | 'out';
      by?: string | null;
      landed?: Cell;
      parts?: RollPart[];
      /** Conta de quem cortou (só em 'intercepted'). */
      interceptRoll?: number;
      interceptParts?: RollPart[];
    }
  | {
      t: 'shot';
      shooter: string;
      zone: GoalZone;
      keeper: string | null;
      keeperZone: GoalZone | null;
      roll: number;
      keeperRoll: number;
      goal: boolean;
      blockedBy?: string | null;
      oneTouch: boolean;
      distance: number;
      parts?: RollPart[];
      /** Conta do goleiro, ou de quem bloqueou. */
      keeperParts?: RollPart[];
    }
  | { t: 'goal'; team: Team; scorer: string; assist: string | null; oneTouch: boolean }
  | { t: 'save'; keeper: string; shooter: string }
  | { t: 'block'; blocker: string; shooter: string }
  | { t: 'skill'; player: string; skillId: string; success: boolean; note?: string }
  | { t: 'flow'; player: string; skillId: string }
  | { t: 'read'; player: string; guess: ReadGuess; correct: boolean; target: string }
  | { t: 'pickup'; player: string; cell: Cell }
  | { t: 'loose'; cell: Cell }
  | { t: 'out'; team: Team; cell: Cell; to: string | null }
  | { t: 'sprint'; player: string }
  | { t: 'blocked'; player: string }
  | { t: 'halftime' }
  | { t: 'end'; winner: Team | 'draw' };

export interface StepFrame {
  positions: Record<string, Cell>;
  ball: Cell;
  holder: string | null;
}

export interface TurnResult {
  state: MatchState;
  events: MatchEvent[];
  frames: StepFrame[];
  /** Linhas de narração (1 a 3). */
  log: string[];
  /** Planos finais usados (depois de IA e reações). */
  plans: PlanMap;
  /** Casas percorridas por jogador (para setas e GIF). */
  paths: Record<string, Cell[]>;
  goal: Team | null;
}

export type { Cell, FieldDims };
