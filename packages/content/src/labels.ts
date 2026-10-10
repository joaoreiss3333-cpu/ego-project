import type { ActionKind, Difficulty, GoalZone, Personality, Position, ReadGuess, Foot } from './types';

/** Nomes exibidos para o jogador. */
export const ACTION_LABEL: Record<ActionKind, string> = {
  conduzir: 'Conduzir',
  driblar: 'Driblar',
  proteger: 'Proteger',
  passe_pe: 'Passe no pé',
  passe_espaco: 'Passe no espaço',
  chutar: 'Chutar',
  tabela: 'Tabela',
  mover: 'Mover',
  desmarque: 'Desmarque',
  abrir_linha: 'Abrir linha',
  corta_luz: 'Corta-luz',
  pedir_bola: 'Pedir a bola',
  finalizar_primeira: 'Chute de primeira',
  bote: 'Bote',
  conter: 'Conter',
  fechar_linha: 'Fechar linha',
  marcar: 'Marcar',
  leitura: 'Leitura',
  gk_posicionar: 'Posicionar',
  gk_sair: 'Sair do gol',
  gk_adiantar: 'Adiantar linha',
  gk_comandar: 'Comandar',
};

export const ACTION_HELP: Record<ActionKind, string> = {
  conduzir: 'Anda com a bola evitando zonas. Para na borda se esbarrar numa.',
  driblar: 'Atravessa zonas. Cada zona cruzada é um duelo.',
  proteger: 'Fica parado com a bola. +2 em duelos defensivos da posse.',
  passe_pe: 'A bola chega onde o aliado terminar o movimento.',
  passe_espaco: 'A bola vai para uma casa. Aliado nela ou ao lado recebe com +2.',
  chutar: 'Finaliza no gol, na zona escolhida.',
  tabela: 'Se o aliado também escolher tabela, a bola vai e volta no mesmo lance.',
  mover: 'Só se move.',
  desmarque: 'Recebe passe com +2. Quem te marcava fica com -1 no próximo lance.',
  abrir_linha: 'Passes para você ou ao seu lado sofrem -2 na interceptação.',
  corta_luz: 'Um adversário adjacente perde 1 casa de movimento.',
  pedir_bola: 'Marca visível só para aliados. Passe para você: +1 e +1 de Química.',
  finalizar_primeira: 'Se receber a bola neste lance, chuta na hora.',
  bote: 'Tenta roubar do portador em contato. Custa fôlego.',
  conter: 'Fecha e espera. Forte contra drible.',
  fechar_linha: '+3 para interceptar passes.',
  marcar: 'Acompanha um atacante até o destino dele.',
  leitura: 'Adivinha a ação do portador. Acertou: +3 e Flow.',
  gk_posicionar: 'Se move dentro da área.',
  gk_sair: 'Disputa bolas soltas na área com bônus.',
  gk_adiantar: 'Intercepta passes na área com bônus, defende chutes com -1.',
  gk_comandar: '+1 de Defesa para um aliado na área.',
};

export const READ_GUESS_LABEL: Record<ReadGuess, string> = {
  passe: 'Passe',
  drible: 'Drible',
  chute: 'Chute',
  proteger: 'Proteger',
};

export const GOAL_ZONE_LABEL: Record<GoalZone, string> = {
  0: 'Baixo esquerdo',
  1: 'Baixo centro',
  2: 'Baixo direito',
  3: 'Alto esquerdo',
  4: 'Alto centro',
  5: 'Alto direito',
};

export const POSITION_LABEL: Record<Position, string> = {
  atacante: 'Atacante',
  meio: 'Meio',
  defensor: 'Defensor',
  goleiro: 'Goleiro',
};

export const FOOT_LABEL: Record<Foot, string> = {
  direito: 'Direito',
  esquerdo: 'Esquerdo',
  ambos: 'Ambos',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  novato: 'Novato',
  regular: 'Regular',
  elite: 'Elite',
  chefe: 'Chefe',
};

export const PERSONALITY_LABEL: Record<Personality, string> = {
  egoista: 'Egoísta',
  coletivo: 'Coletivo',
  agressivo: 'Agressivo',
  cauteloso: 'Cauteloso',
};
