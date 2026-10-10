/**
 * Números derivados para os guias. Tudo sai de @ego/content ou das funções
 * reais do motor e dos serviços, então os guias acompanham qualquer mudança.
 */
import { MATCH_RULES, type Foot, type Position } from '@ego/content';
import { baseMatchReward, validateCharacterInput } from '@ego/db';
import { emptyStats, type MatchState, type PlayerStats } from '@ego/engine';

export const R = MATCH_RULES;

/** Casas por lance (sem sprint nem habilidade). */
export const moveRange = (vel: number) => R.movement.base + Math.floor(vel / R.movement.velocityDivisor);

/** Penalidade de distância do passe (mesma conta do motor). */
export function passPenalty(passe: number, dist: number): number {
  const over = dist - Math.floor(passe / 2);
  return over > 0 ? Math.ceil(over / R.pass.penaltyEvery) : 0;
}

/** Penalidade de distância do chute (sem o ângulo). */
export function shotDistPenalty(dist: number): number {
  return dist > R.shot.freeDistance ? Math.ceil((dist - R.shot.freeDistance) / R.shot.penaltyEvery) : 0;
}

// ---------------------------------------------------------------------------
// Limites da criação de personagem, lidos da validação real do serviço.
// ---------------------------------------------------------------------------

const baseInput = { name: 'Teste', number: 10, position: 'atacante' as Position, foot: 'direito' as Foot, tokenColor: '#1F6BFF' };

function probeRange(ok: (n: number) => boolean, from: number, to: number): [number, number] {
  let min = -1;
  let max = -1;
  for (let n = from; n <= to; n++) {
    if (ok(n)) {
      if (min < 0) min = n;
      max = n;
    }
  }
  return [min, max];
}

export const NAME_LIMITS = probeRange((n) => validateCharacterInput({ ...baseInput, name: 'A'.repeat(n) }) === null, 0, 64);
export const NUMBER_LIMITS = probeRange((n) => validateCharacterInput({ ...baseInput, number: n }) === null, -5, 200);

// ---------------------------------------------------------------------------
// Recompensa de partida (calculada pela mesma função do fechamento).
// ---------------------------------------------------------------------------

export function sampleReward(stats: Partial<PlayerStats>, won: boolean, draw: boolean, ranked: boolean) {
  const st = { ...emptyStats(), ...stats };
  const fake = { players: { X: { stats: st } } } as unknown as MatchState;
  return baseMatchReward(fake, 'X', won, draw, ranked);
}

function perToken(key: 'dribblesWon' | 'tackles', attr: 'drible' | 'defesa'): number {
  for (let n = 1; n <= 20; n++) {
    const r = sampleReward({ [key]: n }, false, false, false);
    if ((r.tokens?.[attr] ?? 0) >= 1) return n;
  }
  return 0;
}

/** Quantos dribles (ou desarmes) numa partida valem 1 ficha. */
export const DRIBBLES_PER_TOKEN = perToken('dribblesWon', 'drible');
export const TACKLES_PER_TOKEN = perToken('tackles', 'defesa');
