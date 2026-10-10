import type { ActionKind, Difficulty } from '../types';

/**
 * Biblioteca de combos da IA. Tudo aqui é declarativo; quem interpreta é
 * packages/engine/src/ai/playbook.ts. Pré-condições, escolha de jogadores e
 * regras de destino são vocabulários fechados, listados nos tipos abaixo.
 */

export type ComboPrecondition =
  | 'weHaveBall'
  | 'theyHaveBall'
  | 'allyAdjacentToCarrier'
  | 'allyWithin2OfCarrier'
  | 'spaceBehindLastLine'
  | 'twoAttackersAvailable'
  | 'defenderAdjacentToCarrier'
  | 'twoDefendersNearCarrier'
  | 'threeDefendersAvailable'
  | 'carrierInOpponentHalf'
  | 'carrierNotInOwnBox'
  | 'opponentCarrierInOurHalf';

export type RolePick =
  | 'carrier'
  | 'nearestAllyToCarrier'
  | 'deepestAttacker'
  | 'secondDeepestAttacker'
  | 'nearestDefenderToCarrier'
  | 'secondNearestDefenderToCarrier'
  | 'farthestDefenderFromCarrier';

export type DestRule =
  | 'stay'
  | 'forwardFree'
  | 'adjacentToCarrier'
  | 'behindLastLine'
  | 'awayFromCarrierWide'
  | 'besideBlockedDefender'
  | 'towardCarrier'
  | 'onPassLaneToDeepest'
  | 'onPassLaneToSecond'
  | 'keepDistance2'
  | 'returnToPartner';

export type ActionTarget = 'none' | `role:${string}` | 'dest' | 'nearestEnemy' | 'opponentCarrier';

export interface ComboStep {
  role: string;
  pick: RolePick;
  action: ActionKind;
  dest: DestRule;
  target?: ActionTarget;
  /** Lance do combo (1 ou 2). */
  turn: 1 | 2;
}

export interface ComboDef {
  id: string;
  name: string;
  description: string;
  side: 'attack' | 'defense';
  duration: 1 | 2;
  /** Dificuldade mínima para o coordenador ativar. */
  minDifficulty: Difficulty;
  preconditions: ComboPrecondition[];
  steps: ComboStep[];
  /** Valor base na escolha do coordenador. */
  weight: number;
}

export const PLAYBOOK: ComboDef[] = [
  {
    id: 'tabela',
    name: 'Tabela',
    description: 'Portador e apoio adjacente combinam ida e volta no mesmo lance.',
    side: 'attack',
    duration: 1,
    minDifficulty: 'novato',
    preconditions: ['weHaveBall', 'allyAdjacentToCarrier', 'defenderAdjacentToCarrier'],
    steps: [
      { role: 'portador', pick: 'carrier', action: 'tabela', dest: 'forwardFree', target: 'role:apoio', turn: 1 },
      { role: 'apoio', pick: 'nearestAllyToCarrier', action: 'tabela', dest: 'stay', target: 'role:portador', turn: 1 },
    ],
    weight: 1.2,
  },
  {
    id: 'desmarque_espaco',
    name: 'Desmarque + passe no espaço',
    description: 'Um atacante ataca o espaço atrás da última linha e o portador lança na casa.',
    side: 'attack',
    duration: 1,
    minDifficulty: 'regular',
    preconditions: ['weHaveBall', 'spaceBehindLastLine', 'twoAttackersAvailable'],
    steps: [
      { role: 'portador', pick: 'carrier', action: 'passe_espaco', dest: 'stay', target: 'role:profundidade', turn: 1 },
      { role: 'profundidade', pick: 'deepestAttacker', action: 'desmarque', dest: 'behindLastLine', turn: 1 },
    ],
    weight: 1.3,
  },
  {
    id: 'isca',
    name: 'Isca',
    description: 'Um atacante corre para puxar o marcador e abre a linha de passe para outro.',
    side: 'attack',
    duration: 1,
    minDifficulty: 'regular',
    preconditions: ['weHaveBall', 'twoAttackersAvailable'],
    steps: [
      { role: 'isca', pick: 'deepestAttacker', action: 'mover', dest: 'awayFromCarrierWide', turn: 1 },
      { role: 'alvo', pick: 'secondDeepestAttacker', action: 'pedir_bola', dest: 'onPassLaneToSecond', turn: 1 },
      { role: 'portador', pick: 'carrier', action: 'passe_pe', dest: 'stay', target: 'role:alvo', turn: 1 },
    ],
    weight: 1.0,
  },
  {
    id: 'corta_luz_drible',
    name: 'Corta-luz + drible',
    description: 'Um aliado trava o defensor mais próximo e o portador dribla pelo lado liberado.',
    side: 'attack',
    duration: 1,
    minDifficulty: 'regular',
    preconditions: ['weHaveBall', 'allyWithin2OfCarrier', 'defenderAdjacentToCarrier'],
    steps: [
      { role: 'bloqueio', pick: 'nearestAllyToCarrier', action: 'corta_luz', dest: 'besideBlockedDefender', target: 'nearestEnemy', turn: 1 },
      { role: 'portador', pick: 'carrier', action: 'driblar', dest: 'forwardFree', turn: 1 },
    ],
    weight: 1.1,
  },
  {
    id: 'pressao_dupla',
    name: 'Pressão em dupla',
    description: 'Um defensor dá Bote e outro Contém o mesmo portador, cobrindo drible e proteção.',
    side: 'defense',
    duration: 1,
    minDifficulty: 'novato',
    preconditions: ['theyHaveBall', 'twoDefendersNearCarrier'],
    steps: [
      { role: 'bote', pick: 'nearestDefenderToCarrier', action: 'bote', dest: 'towardCarrier', target: 'opponentCarrier', turn: 1 },
      { role: 'contencao', pick: 'secondNearestDefenderToCarrier', action: 'conter', dest: 'keepDistance2', turn: 1 },
    ],
    weight: 1.2,
  },
  {
    id: 'leitura_coordenada',
    name: 'Leitura coordenada',
    description: 'Um defensor Contém enquanto o mais distante faz Leitura na ação provável.',
    side: 'defense',
    duration: 1,
    minDifficulty: 'elite',
    preconditions: ['theyHaveBall', 'twoDefendersNearCarrier'],
    steps: [
      { role: 'contencao', pick: 'nearestDefenderToCarrier', action: 'conter', dest: 'keepDistance2', turn: 1 },
      { role: 'leitor', pick: 'farthestDefenderFromCarrier', action: 'leitura', dest: 'towardCarrier', turn: 1 },
    ],
    weight: 1.1,
  },
  {
    id: 'linha_impedimento_passe',
    name: 'Linha de impedimento de passe',
    description: 'Dois defensores fecham linhas diferentes enquanto um terceiro pressiona.',
    side: 'defense',
    duration: 1,
    minDifficulty: 'elite',
    preconditions: ['theyHaveBall', 'threeDefendersAvailable'],
    steps: [
      { role: 'pressao', pick: 'nearestDefenderToCarrier', action: 'bote', dest: 'towardCarrier', target: 'opponentCarrier', turn: 1 },
      { role: 'linha1', pick: 'secondNearestDefenderToCarrier', action: 'fechar_linha', dest: 'onPassLaneToDeepest', turn: 1 },
      { role: 'linha2', pick: 'farthestDefenderFromCarrier', action: 'fechar_linha', dest: 'onPassLaneToSecond', turn: 1 },
    ],
    weight: 1.15,
  },
];

export function getCombo(id: string): ComboDef {
  const c = PLAYBOOK.find((x) => x.id === id);
  if (!c) throw new Error(`Combo desconhecido: ${id}`);
  return c;
}
