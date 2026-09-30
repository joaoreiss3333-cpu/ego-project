export type Rarity = 'comum' | 'rara' | 'epica' | 'lendaria' | 'mitica';
export const RARITIES: Rarity[] = ['comum', 'rara', 'epica', 'lendaria', 'mitica'];

export type AttrKey = 'velocidade' | 'drible' | 'passe' | 'chute' | 'fisico' | 'visao' | 'defesa';
export const ATTRS: AttrKey[] = ['velocidade', 'drible', 'passe', 'chute', 'fisico', 'visao', 'defesa'];
export type Attrs = Record<AttrKey, number>;

export type Position = 'atacante' | 'meio' | 'defensor' | 'goleiro';
export type Foot = 'direito' | 'esquerdo' | 'ambos';

export type MatchMode = '1v1' | '2v2' | '3v3' | '4v4' | '5v5';
export const MATCH_MODES: MatchMode[] = ['1v1', '2v2', '3v3', '4v4', '5v5'];

/** Ações do portador da bola. */
export type BallAction = 'conduzir' | 'driblar' | 'proteger' | 'passe_pe' | 'passe_espaco' | 'chutar' | 'tabela';
/** Ações sem bola do time que ataca. */
export type OffBallAttackAction =
  | 'mover'
  | 'desmarque'
  | 'abrir_linha'
  | 'corta_luz'
  | 'pedir_bola'
  | 'tabela'
  | 'finalizar_primeira';
/** Ações sem bola do time que defende. */
export type DefenseAction = 'mover' | 'bote' | 'conter' | 'fechar_linha' | 'marcar' | 'leitura';
/** Ações do goleiro humano. */
export type GoalkeeperAction = 'gk_posicionar' | 'gk_sair' | 'gk_adiantar' | 'gk_comandar';

export type ActionKind = BallAction | OffBallAttackAction | DefenseAction | GoalkeeperAction;

/** O que a Leitura tenta adivinhar. */
export type ReadGuess = 'passe' | 'drible' | 'chute' | 'proteger';

/** 6 zonas do gol: 0..2 embaixo (esq, centro, dir), 3..5 em cima. */
export type GoalZone = 0 | 1 | 2 | 3 | 4 | 5;

export type Difficulty = 'novato' | 'regular' | 'elite' | 'chefe';
export type Personality = 'egoista' | 'coletivo' | 'agressivo' | 'cauteloso';

/** Identificadores dos efeitos que o motor sabe executar. */
export type SkillEffect =
  | 'stamina_refill_allplus'
  | 'extra_move'
  | 'tackle_bonus'
  | 'cover_ally'
  | 'zone_radius'
  | 'shot_block'
  | 'peek_carrier_action'
  | 'free_jump'
  | 'panther'
  | 'accel_trail'
  | 'late_move'
  | 'speed_shot'
  | 'ego_awake'
  | 'spatial_read'
  | 'metavision'
  | 'direct_shot'
  | 'puzzle_piece'
  | 'devour'
  | 'perfect_ginga'
  | 'ginga_rhythm'
  | 'improvise'
  | 'samba'
  | 'curve_pass';

/** Quando a habilidade pode ser escolhida. */
export type SkillRequirement =
  | { kind: 'any' }
  | { kind: 'withBall'; actions?: BallAction[] }
  | { kind: 'withoutBall'; actions?: (OffBallAttackAction | DefenseAction)[] }
  | { kind: 'defending'; actions?: DefenseAction[] };

/** Alvo extra exigido pela habilidade no planejamento. */
export type SkillTarget = 'none' | 'ally' | 'enemy';

/**
 * Condições que a IA sabe avaliar (packages/engine/src/ai/conditions.ts).
 * Servem para as dicas de uso de cada linhagem.
 */
export type AiCondition =
  | 'hasBall'
  | 'noBall'
  | 'defending'
  | 'attacking'
  | 'nearOpponentBox'
  | 'inOwnHalf'
  | 'opponentHasShotPosition'
  | 'leadingScore'
  | 'trailingScore'
  | 'closeScoreLate'
  | 'counterAttackAgainst'
  | 'counterAttackFor'
  | 'onWing'
  | 'longStraightRun'
  | 'movedFarThisTurn'
  | 'allyHighPassReady'
  | 'readingAgainstMe'
  | 'weakDefenderAhead'
  | 'allyWillTackle'
  | 'duelLikely'
  | 'enemyAdjacent'
  | 'receivingPassLikely'
  | 'defenderOnPassLine'
  | 'lowStamina'
  | 'rhythmStacksFull';

export interface SkillAiHint {
  /** Texto curto, usado no guia e no modo de depuração. */
  when: string;
  /** 0..10: quanto o bot valoriza usar quando as condições batem. */
  priority: number;
  /** Todas precisam ser verdadeiras. */
  conditions: AiCondition[];
  /** Condições que, se verdadeiras, aumentam o valor. */
  bonusIf?: AiCondition[];
  /** Habilidades ou combos do playbook com que combina. */
  combosWith?: string[];
}

export interface SkillDef {
  id: string;
  lineageId: string;
  name: string;
  kind: 'active' | 'flow';
  effect: SkillEffect;
  /** Custo de fôlego (ativas). Flow não custa fôlego. */
  stamina: number;
  /** Recarga em lances (ativas). */
  cooldown: number;
  /** Números do efeito. Evoluções da árvore sobrescrevem estes valores. */
  params: Record<string, number>;
  requirement: SkillRequirement;
  target: SkillTarget;
  /** Janela de reação entre revelação e resolução. */
  reaction?: boolean;
  /** Texto do efeito gerado a partir dos números, para o guia sempre bater com o conteúdo. */
  describe: (p: Record<string, number>, s: { stamina: number; cooldown: number }) => string;
  /** Tag de contra-jogo: como o adversário responde a essa habilidade. */
  counterplay: string;
  ai: SkillAiHint;
}

export type TreeNodeType = 'flow_start' | 'skill' | 'evolution' | 'awakening';

export interface TreeNode {
  id: string;
  name: string;
  type: TreeNodeType;
  /** Pontos de Linhagem. 0 para o nó inicial. */
  cost: number;
  /** Nó anterior do mesmo ramo. */
  requires?: string;
  /** Habilidade liberada pelo nó. */
  grantsSkill?: string;
  /** Evolução: habilidade afetada e números novos. */
  evolves?: { skillId: string; params?: Record<string, number>; stamina?: number; cooldown?: number };
  /** Despertar: missão que precisa estar concluída com a linhagem. */
  awakeningMission?: string;
}

export interface TreeBranch {
  id: string;
  name: string;
  nodes: TreeNode[];
}

export interface LineageDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Frase curta de apresentação na voz da instalação. */
  tagline: string;
  description: string;
  caps: Attrs;
  /** Posição natural (usada pela IA e pelo guia). */
  naturalPosition: Position;
  skills: SkillDef[];
  /** Nó inicial grátis com a habilidade de Flow. */
  startNode: TreeNode;
  branches: TreeBranch[];
  /** Estilo de jogo para a IA: pesos extras de ações. */
  playstyle: {
    summary: string;
    actionBias: Partial<Record<ActionKind, number>>;
  };
}

export type MissionMetric =
  | 'leitura_certa'
  | 'assistencia'
  | 'treino'
  | 'vitoria_selecao'
  | 'drible_vencido'
  | 'vitoria_partida'
  | 'gol'
  | 'gol_de_primeira'
  | 'partida_jogada'
  | 'desarme'
  | 'defesa_goleiro'
  | 'passe_certo'
  | 'habilidade_usada';

export interface Reward {
  xp?: number;
  ienes?: number;
  coins?: number;
  tokens?: Partial<Record<AttrKey, number>>;
  items?: string[];
  cosmetics?: string[];
}

export interface MissionDef {
  id: string;
  name: string;
  description: string;
  kind: 'daily' | 'weekly' | 'awakening';
  metric: MissionMetric;
  target: number;
  /** Só conta usando esta linhagem equipada. */
  lineageId?: string;
  reward: Reward;
}

export type EquipSlot = 'chuteira' | 'caneleira';

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  attr: AttrKey;
  /** Bônus por nível de melhoria (+0, +1, +2). */
  bonusByLevel: [number, number, number];
  /** Custo em Ienes para ir para +1 e +2. */
  upgradeCost: [number, number];
  source: string;
  description: string;
}

export type CosmeticType = 'moldura' | 'titulo' | 'rastro';

export type CosmeticUnlock =
  | { kind: 'default'; rarity?: Rarity }
  | { kind: 'selection'; groupId: string }
  | { kind: 'stat'; stat: 'gols'; value: number }
  | { kind: 'craft'; tokens: Partial<Record<AttrKey, number>>; ienes: number };

export interface CosmeticDef {
  id: string;
  name: string;
  type: CosmeticType;
  description: string;
  unlock: CosmeticUnlock;
  /** Cor principal usada nas imagens. */
  color: string;
}

export interface BotSpec {
  name: string;
  lineageId: string;
  level: number;
  personality: Personality;
  position: Position;
  /** Nós da árvore comprados. Se vazio, a IA monta a partir do nível. */
  nodes?: string[];
  /** Loadout explícito (3 ativas + 1 flow). */
  loadout?: { active: string[]; flow: string };
}

export interface SelectionStage {
  id: string;
  name: string;
  subtitle: string;
  mode: MatchMode;
  difficulty: Difficulty;
  boss: boolean;
  /** Time adversário (sem goleiro; o goleiro é sempre bot). */
  opponents: BotSpec[];
  /** Teto do orçamento de raridade do time adversário. */
  rarityBudget: number;
  /** Primeira vitória. */
  firstReward: Reward;
  /** Repetição. */
  repeatReward: Reward;
  /** Chance de drop de equipamento em repetição (0..1). */
  dropChance: number;
  dropItem?: string;
  /** Regras da partida. */
  rules: { turnsPerHalf: number; halves: number; firstTo?: number };
}

export interface SelectionGroup {
  id: string;
  name: string;
  description: string;
  stages: SelectionStage[];
  /** Cosmético liberado ao concluir todas as etapas. */
  completionCosmetic?: string;
}
