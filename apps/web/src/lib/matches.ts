import type { Match, MatchParticipant } from '@ego/db';

export const KIND_LABEL: Record<string, string> = {
  casual: 'Casual',
  ranqueada: 'Ranqueada',
  selecao: 'Modo Seleção',
  treino: 'Treino',
  simulacao: 'Simulação',
};

interface MatchResult {
  winner?: 'A' | 'B' | 'draw' | null;
  score?: { A: number; B: number };
  countsForMmr?: boolean;
}

export function matchResult(m: Pick<Match, 'result'>): MatchResult {
  return (m.result ?? {}) as MatchResult;
}

/** Resultado do ponto de vista do participante. */
export function matchOutcome(p: MatchParticipant & { match: Match }) {
  const r = matchResult(p.match);
  const mine = p.team as 'A' | 'B';
  const other = mine === 'A' ? 'B' : 'A';
  const score = r.score ? `${r.score[mine]} x ${r.score[other]}` : '-';
  if (!r.winner) return { code: 'n', label: 'S/R', score };
  if (r.winner === 'draw') return { code: 'e', label: 'Empate', score };
  return r.winner === mine ? { code: 'v', label: 'Vitória', score } : { code: 'd', label: 'Derrota', score };
}
