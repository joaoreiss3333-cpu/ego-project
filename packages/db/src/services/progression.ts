import { ATTRS, PROGRESSION, getCosmetic, getEquipment, xpForLevel, type AttrKey, type Reward } from '@ego/content';
import type { Character } from '@prisma/client';
import type { Tx } from '../client';

export const TOKEN_FIELD: Record<AttrKey, keyof Character> = {
  velocidade: 'tokVelocidade',
  drible: 'tokDrible',
  passe: 'tokPasse',
  chute: 'tokChute',
  fisico: 'tokFisico',
  visao: 'tokVisao',
  defesa: 'tokDefesa',
};

export function tokensOf(c: Character): Record<AttrKey, number> {
  return Object.fromEntries(ATTRS.map((k) => [k, c[TOKEN_FIELD[k]] as number])) as Record<AttrKey, number>;
}

export function attrsOf(c: Character): Record<AttrKey, number> {
  return Object.fromEntries(ATTRS.map((k) => [k, c[k] as number])) as Record<AttrKey, number>;
}

/** Nível e XP depois de ganhar `gain`, com os pontos ganhos no caminho. */
export function applyXp(level: number, xp: number, gain: number) {
  let lvl = level;
  let cur = xp + Math.max(0, Math.round(gain));
  let attrPoints = 0;
  let lineagePoints = 0;
  while (lvl < PROGRESSION.maxLevel && cur >= xpForLevel(lvl)) {
    cur -= xpForLevel(lvl);
    lvl++;
    attrPoints += PROGRESSION.attributePointsPerLevel;
    if (lvl % PROGRESSION.lineagePointEvery === 0) lineagePoints++;
  }
  if (lvl >= PROGRESSION.maxLevel) cur = 0;
  return { level: lvl, xp: cur, attrPoints, lineagePoints, levelsGained: lvl - level };
}

export interface AppliedReward {
  xp: number;
  ienes: number;
  coins: number;
  tokens: Partial<Record<AttrKey, number>>;
  items: string[];
  cosmetics: string[];
  levelsGained: number;
  newLevel: number;
}

/** Aplica uma recompensa (com multiplicador) dentro de uma transação. */
export async function grantReward(tx: Tx, characterId: string, reward: Reward, multiplier = 1): Promise<AppliedReward> {
  const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
  const m = (n?: number) => Math.max(0, Math.round((n ?? 0) * multiplier));
  const xp = m(reward.xp);
  const lv = applyXp(c.level, c.xp, xp);
  const data: Record<string, unknown> = {
    level: lv.level,
    xp: lv.xp,
    attrPoints: { increment: lv.attrPoints },
    lineagePoints: { increment: lv.lineagePoints },
    ienes: { increment: m(reward.ienes) },
    // moeda premium nunca é multiplicada pelas travas (vem só de missões e admin)
    coins: { increment: reward.coins ?? 0 },
  };
  const tokens: Partial<Record<AttrKey, number>> = {};
  for (const [k, v] of Object.entries(reward.tokens ?? {}) as [AttrKey, number][]) {
    const amount = m(v);
    if (!amount) continue;
    tokens[k] = amount;
    data[TOKEN_FIELD[k]] = { increment: amount };
  }
  await tx.character.update({ where: { id: characterId }, data });
  for (const itemId of reward.items ?? []) {
    getEquipment(itemId);
    await tx.inventoryItem.create({ data: { characterId, itemId } });
  }
  const cosmetics: string[] = [];
  for (const cid of reward.cosmetics ?? []) {
    getCosmetic(cid);
    const owned = await tx.cosmeticOwned.findUnique({ where: { characterId_cosmeticId: { characterId, cosmeticId: cid } } });
    if (!owned) {
      await tx.cosmeticOwned.create({ data: { characterId, cosmeticId: cid } });
      cosmetics.push(cid);
    }
  }
  return {
    xp,
    ienes: m(reward.ienes),
    coins: reward.coins ?? 0,
    tokens,
    items: reward.items ?? [],
    cosmetics,
    levelsGained: lv.levelsGained,
    newLevel: lv.level,
  };
}

export function mergeRewards(a: Reward, b: Reward): Reward {
  const tokens: Partial<Record<AttrKey, number>> = { ...(a.tokens ?? {}) };
  for (const [k, v] of Object.entries(b.tokens ?? {}) as [AttrKey, number][]) tokens[k] = (tokens[k] ?? 0) + v;
  return {
    xp: (a.xp ?? 0) + (b.xp ?? 0),
    ienes: (a.ienes ?? 0) + (b.ienes ?? 0),
    coins: (a.coins ?? 0) + (b.coins ?? 0),
    tokens,
    items: [...(a.items ?? []), ...(b.items ?? [])],
    cosmetics: [...(a.cosmetics ?? []), ...(b.cosmetics ?? [])],
  };
}
