import { COSMETICS, EQUIPMENT, LINEAGES, getCosmetic, getEquipment, type AttrKey, type CosmeticDef, type CosmeticType } from '@ego/content';
import type { Character } from '@prisma/client';
import { prisma, type Tx } from '../client';
import { ERR } from '../errors';
import { TOKEN_FIELD, tokensOf } from './progression';

export async function inventory(characterId: string) {
  const [items, owned, lineages, c] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { characterId }, orderBy: { obtainedAt: 'asc' } }),
    prisma.cosmeticOwned.findMany({ where: { characterId } }),
    prisma.lineageProgress.findMany({ where: { characterId } }),
    prisma.character.findUniqueOrThrow({ where: { id: characterId } }),
  ]);
  const ownedIds = new Set(owned.map((o) => o.cosmeticId));
  const rarities = new Set(lineages.map((l) => LINEAGES.find((x) => x.id === l.lineageId)?.rarity));
  const cosmetics = COSMETICS.map((def) => ({ def, owned: cosmeticAvailable(def, ownedIds, rarities), equipped: [c.frameId, c.titleId, c.trailId].includes(def.id) }));
  return {
    equipment: items.map((it) => ({ ...it, def: getEquipment(it.itemId) })),
    cosmetics,
    character: c,
  };
}

/** Molduras de raridade: liberadas para quem já obteve uma linhagem daquela raridade. */
export function cosmeticAvailable(def: CosmeticDef, ownedIds: Set<string>, rarities: Set<string | undefined>): boolean {
  if (def.unlock.kind === 'default') return !def.unlock.rarity || rarities.has(def.unlock.rarity);
  return ownedIds.has(def.id);
}

export async function equipItem(characterId: string, inventoryItemId: string) {
  return prisma.$transaction(async (tx) => {
    const it = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!it || it.characterId !== characterId) throw ERR.invalid('Item não encontrado.');
    const def = getEquipment(it.itemId);
    const sameSlot = await tx.inventoryItem.findMany({ where: { characterId, equipped: true } });
    for (const o of sameSlot) if (getEquipment(o.itemId).slot === def.slot) await tx.inventoryItem.update({ where: { id: o.id }, data: { equipped: false } });
    return tx.inventoryItem.update({ where: { id: it.id }, data: { equipped: true } });
  });
}

export async function unequipItem(characterId: string, inventoryItemId: string) {
  const it = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!it || it.characterId !== characterId) throw ERR.invalid('Item não encontrado.');
  return prisma.inventoryItem.update({ where: { id: it.id }, data: { equipped: false } });
}

export async function upgradeItem(characterId: string, inventoryItemId: string) {
  return prisma.$transaction(async (tx) => {
    const it = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!it || it.characterId !== characterId) throw ERR.invalid('Item não encontrado.');
    if (it.level >= 2) throw ERR.invalid('Esse item já está no nível máximo (+2).');
    const cost = getEquipment(it.itemId).upgradeCost[it.level];
    const paid = await tx.character.updateMany({ where: { id: characterId, ienes: { gte: cost } }, data: { ienes: { decrement: cost } } });
    if (paid.count !== 1) throw ERR.notEnough('Ienes');
    return tx.inventoryItem.update({ where: { id: it.id }, data: { level: it.level + 1 } });
  });
}

export async function craftCosmetic(characterId: string, cosmeticId: string) {
  const def = getCosmetic(cosmeticId);
  if (def.unlock.kind !== 'craft') throw ERR.invalid('Esse cosmético não é criado: ele é conquistado.');
  const unlock = def.unlock;
  return prisma.$transaction(async (tx) => {
    const owned = await tx.cosmeticOwned.findUnique({ where: { characterId_cosmeticId: { characterId, cosmeticId } } });
    if (owned) throw ERR.invalid('Você já tem esse cosmético.');
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const tok = tokensOf(c);
    const where: Record<string, unknown> = { id: characterId, ienes: { gte: unlock.ienes } };
    const data: Record<string, unknown> = { ienes: { decrement: unlock.ienes } };
    for (const [k, v] of Object.entries(unlock.tokens) as [AttrKey, number][]) {
      if (tok[k] < v) throw ERR.notEnough('fichas');
      where[TOKEN_FIELD[k]] = { gte: v };
      data[TOKEN_FIELD[k]] = { decrement: v };
    }
    if (c.ienes < unlock.ienes) throw ERR.notEnough('Ienes');
    const paid = await tx.character.updateMany({ where, data });
    if (paid.count !== 1) throw ERR.notEnough('recursos');
    return tx.cosmeticOwned.create({ data: { characterId, cosmeticId } });
  });
}

const FIELD: Record<CosmeticType, 'frameId' | 'titleId' | 'trailId'> = { moldura: 'frameId', titulo: 'titleId', rastro: 'trailId' };

export async function equipCosmetic(characterId: string, type: CosmeticType, cosmeticId: string | null) {
  if (cosmeticId) {
    const def = getCosmetic(cosmeticId);
    if (def.type !== type) throw ERR.invalid('Cosmético de outro tipo.');
    const inv = await inventory(characterId);
    if (!inv.cosmetics.find((x) => x.def.id === cosmeticId)?.owned) throw ERR.invalid('Você ainda não liberou esse cosmético.');
  }
  return prisma.character.update({ where: { id: characterId }, data: { [FIELD[type]]: cosmeticId } });
}

/** Cosméticos por estatística (ex.: título Egoísta com 10 gols). */
export async function checkStatUnlocks(tx: Tx, c: Pick<Character, 'id' | 'goals'>): Promise<string[]> {
  const granted: string[] = [];
  for (const def of COSMETICS) {
    if (def.unlock.kind !== 'stat') continue;
    if (def.unlock.stat === 'gols' && c.goals >= def.unlock.value) {
      const has = await tx.cosmeticOwned.findUnique({ where: { characterId_cosmeticId: { characterId: c.id, cosmeticId: def.id } } });
      if (!has) {
        await tx.cosmeticOwned.create({ data: { characterId: c.id, cosmeticId: def.id } });
        granted.push(def.id);
      }
    }
  }
  return granted;
}

export { EQUIPMENT, COSMETICS };
