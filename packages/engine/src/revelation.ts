import type { Cell } from './grid';
import type { MatchState, PlanMap } from './types';

export type ArrowCategory = 'ataque' | 'apoio' | 'defesa' | 'goleiro';

/**
 * O que a revelação pública mostra de cada plano: destino (seta), a categoria
 * da seta, se há habilidade envolvida e se o jogador está em Leitura (postura visível).
 * Ação exata, alvo do passe, zona do chute, zona do goleiro e o palpite da Leitura
 * continuam secretos até a resolução.
 */
export interface PublicArrow {
  playerId: string;
  from: Cell;
  dest: Cell;
  category: ArrowCategory;
  usesSkill: boolean;
  usesFlow: boolean;
  reading: boolean;
  sprint: boolean;
}

export function publicRevelation(state: MatchState, plans: PlanMap): PublicArrow[] {
  const holder = state.ball.holder;
  const attackTeam = holder ? state.players[holder].team : null;
  return state.order.map((id) => {
    const p = state.players[id];
    const pl = plans[id];
    let category: ArrowCategory;
    if (p.isKeeper && holder !== id) category = 'goleiro';
    else if (holder === id) category = 'ataque';
    else if (attackTeam && attackTeam === p.team) category = 'apoio';
    else category = attackTeam ? 'defesa' : 'apoio';
    return {
      playerId: id,
      from: { ...p.pos },
      dest: pl ? { ...pl.dest } : { ...p.pos },
      category,
      usesSkill: !!pl?.skill,
      usesFlow: !!pl?.useFlow,
      reading: pl?.action === 'leitura',
      sprint: !!pl?.sprint,
    };
  });
}
