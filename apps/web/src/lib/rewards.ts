import { ATTR_LABEL, GAME, getCosmetic, getEquipment, type AttrKey, type Reward } from '@ego/content';
import { fmt } from './format';

/** Recompensa em texto curto, na ordem que o jogador lê. */
export function rewardParts(r: Reward): string[] {
  const out: string[] = [];
  if (r.xp) out.push(`${fmt(r.xp)} XP`);
  if (r.ienes) out.push(`${fmt(r.ienes)} ${GAME.commonCurrency.plural}`);
  if (r.coins) out.push(`${fmt(r.coins)} ${GAME.premiumCurrency.short}`);
  for (const [k, v] of Object.entries(r.tokens ?? {}) as [AttrKey, number][]) if (v) out.push(`${v} fichas de ${ATTR_LABEL[k]}`);
  for (const id of r.items ?? []) out.push(getEquipment(id).name);
  for (const id of r.cosmetics ?? []) out.push(getCosmetic(id).name);
  return out;
}

export const rewardText = (r: Reward) => rewardParts(r).join(' · ') || '—';
