/**
 * Números do jogo de turnos individuais. Tudo que balanceia a partida mora aqui
 * (ver REGRAS.md). Os valores são iniciais e serão ajustados nos testes e simulações.
 */
export const TURNOS = {
  /** Tempo de cada turno (segundos). Quem não joga a tempo perde a vez. */
  turnSeconds: 25,
  /** Tempo do goleiro para escolher o canto na hora do chute. */
  keeperSeconds: 15,
  roundsPerHalf: 6,
  halves: 2,

  move: { noBall: 2, withBall: 1 },

  /** Cobertura: +1 de Defesa para cada outro marcador colado no portador. */
  coverage: 1,
  carrinhoBonus: 3,
  /** Chance de falta quando o desarme falha: d10 <= valor. */
  foul: { bote: 2, carrinho: 5 },
  /** Chance de amarelo dada a falta: d10 <= valor. */
  yellow: { bote: 1, carrinho: 4 },
  /** Rodadas fora depois de um vermelho quando o time só tem 1 jogador de linha. */
  redSuspension: 3,

  /** Penalidade em todas as rolagens da próxima ação do alvo. */
  conter: { normal: 2, carrier: 3 },

  /** Atributo / divisor: Visão dá ⌊Visão ÷ 3⌋ em passes difíceis e interceptações. */
  visionDivisor: 3,

  pass: {
    curto: { range: 3, threshold: 6 },
    longo: { range: 7, threshold: 9, free: 3, every: 2 },
    profundidade: { range: 4, threshold: 8, free: 2, every: 2, run: 2 },
    cruzamento: { threshold: 9 },
  },

  shot: {
    freeDistance: 4,
    penaltyEvery: 2,
    markerPenalty: 1,
    maxDistance: 8,
    keeperCorner: 4,
    adiantarPenalty: 1,
    penaltySpot: 3,
  },

  keeper: {
    move: 2,
    adiantarIntercept: 2,
    comandar: 1,
    sairBonus: 3,
    claimRange: 2,
  },
} as const;

export const CORNER_LABEL = ['Cima', 'Centro', 'Baixo'] as const;
export const PASS_LABEL = { curto: 'Passe curto', longo: 'Passe longo', profundidade: 'Profundidade', cruzamento: 'Cruzamento' } as const;
/** "tenta ___": com o artigo certo. */
export const PASS_PHRASE = { curto: 'o passe curto', longo: 'o passe longo', profundidade: 'a profundidade', cruzamento: 'o cruzamento' } as const;
export const POSTURE_LABEL = { posicionar: 'Posicionar', adiantar: 'Adiantar linha', comandar: 'Comandar', sair: 'Sair do gol' } as const;
