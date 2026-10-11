import type { Cell } from '../grid';
import type { RngState } from '../rng';
import type { MatchSetup, PlayerStats, Team } from '../types';

export type Corner = 0 | 1 | 2;
export type PassType = 'curto' | 'longo' | 'profundidade' | 'cruzamento';
export type Posture = 'posicionar' | 'adiantar' | 'comandar' | 'sair';

export type Action =
  | { kind: 'mover'; dest: Cell }
  /** Desarme padrão no portador adversário colado. */
  | { kind: 'bote' }
  /** Desarme mais forte e mais arriscado. */
  | { kind: 'carrinho' }
  | { kind: 'conter'; target: string }
  | { kind: 'driblar'; target: string }
  /** `to`: casa do aliado (curto, longo, cruzamento) ou casa vazia (profundidade, com `runner`). */
  | { kind: 'passe'; type: PassType; to: Cell; runner?: string; corner?: Corner }
  | { kind: 'chutar'; corner: Corner }
  | { kind: 'goleiro'; posture: Posture; dest?: Cell; ally?: string }
  /** Perde a vez (tempo esgotado). */
  | { kind: 'passar' };

export interface TPlayer {
  id: string;
  team: Team;
  isKeeper: boolean;
  pos: Cell;
  stats: PlayerStats;
  fouls: number;
  yellow: number;
  /** Fora de campo até esta rodada (inclusive). 9999 = expulso. */
  offUntil: number;
  /** Caiu no carrinho: não se move no próximo turno. */
  fallen: boolean;
  /** Penalidade nas rolagens da próxima ação (efeito de Conter). */
  conter: number;
  posture: Posture;
  commandAlly: string | null;
}

export interface FreeKick {
  player: string;
  kind: 'direto' | 'penalti';
}

export interface TState {
  engine: 'turnos';
  setup: MatchSetup;
  rng: RngState;
  /** Rodada global (começa em 1). */
  round: number;
  half: number;
  roundInHalf: number;
  /** Ordem de turnos (times intercalados). */
  order: string[];
  cursor: number;
  /** Quantos turnos já foram jogados. */
  turnCount: number;
  score: Record<Team, number>;
  ball: { holder: string | null; pos: Cell };
  players: Record<string, TPlayer>;
  kickoffTeam: Team;
  /** Cobrança de falta em andamento: o jogador faltado joga um turno extra. */
  freeKick: FreeKick | null;
  /** Quantos chutes de cada jogador foram em cada canto (o goleiro bot lê isso). */
  shotHistory: Record<string, [number, number, number]>;
  lastPass: { passer: string; receiver: string; n: number } | null;
  finished: boolean;
  winner: Team | 'draw' | null;
}

export type TEvent =
  | { t: 'move'; id: string; from: Cell; to: Cell }
  | { t: 'duel'; id: string; target: string; kind: 'bote' | 'carrinho' | 'drible' | 'conter'; result: 'win' | 'tie' | 'lose'; cell: Cell }
  | { t: 'pass'; id: string; type: PassType; from: Cell; to: Cell; end: Cell; result: 'ok' | 'cortado' | 'solta' | 'parou' | 'disputa' }
  | { t: 'shot'; id: string; from: Cell; corner: Corner; result: 'gol' | 'defesa' | 'rebote'; header: boolean }
  | { t: 'foul'; id: string; victim: string; card: 'amarelo' | 'vermelho' | null }
  | { t: 'goal'; team: Team; scorer: string; assist: string | null }
  | { t: 'halftime' }
  | { t: 'end'; winner: Team | 'draw' };

export interface ActionResult {
  state: TState;
  actor: string;
  /** Linhas de narração com as contas das rolagens. */
  log: string[];
  events: TEvent[];
  goal: Team | null;
}

export interface ActionOpts {
  /**
   * Palpite do goleiro adversário numa finalização.
   * `undefined`: o goleiro bot lê o histórico do chutador. `null`: não adivinhou (sem o bônus).
   */
  keeperGuess?: Corner | null;
  /** Dados forçados (testes): consumidos em ordem, no lugar do RNG. */
  dice?: number[];
}

export interface PassOption {
  to: Cell;
  /** Quem recebe (curto, longo, cruzamento) ou quem corre (profundidade). */
  receiver: string;
  dist: number;
}

export interface LegalSet {
  /** `normal`, ou a cobrança de falta/pênalti do turno extra. */
  mode: 'normal' | 'falta' | 'penalti';
  move: Cell[];
  bote: boolean;
  carrinho: boolean;
  conter: string[];
  driblar: { target: string; landing: Cell }[];
  passes: Record<PassType, PassOption[]>;
  chutar: boolean;
  goleiro: { posture: Posture; dests?: Cell[]; allies?: string[] }[];
}
