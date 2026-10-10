'use server';

import { revalidatePath } from 'next/cache';
import { COSMETICS, SITE_PATHS, getEquipment, type CosmeticType } from '@ego/content';
import { craftCosmetic, equipCosmetic, equipItem, unequipItem, upgradeItem } from '@ego/db';
import type { ActionState } from '@/lib/action-state';
import { done, fail, withCharacter } from '@/lib/run';

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};

const TYPES: CosmeticType[] = ['moldura', 'titulo', 'rastro'];

export async function equipItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const it = await equipItem(c.id, str(fd, 'itemId'));
    revalidatePath(SITE_PATHS.equipamentos);
    return done(`${getEquipment(it.itemId).name} equipado.`);
  });
}

export async function unequipItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const it = await unequipItem(c.id, str(fd, 'itemId'));
    revalidatePath(SITE_PATHS.equipamentos);
    return done(`${getEquipment(it.itemId).name} guardado.`);
  });
}

export async function upgradeItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const it = await upgradeItem(c.id, str(fd, 'itemId'));
    revalidatePath(SITE_PATHS.equipamentos);
    return done(`${getEquipment(it.itemId).name} agora está em +${it.level}.`);
  });
}

export async function craftCosmeticAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const id = str(fd, 'cosmeticId');
    const def = COSMETICS.find((x) => x.id === id);
    if (!def) return fail('Cosmético desconhecido.');
    await craftCosmetic(c.id, id);
    revalidatePath(SITE_PATHS.cosmeticos);
    return done(`${def.name} criado. Já dá para equipar.`);
  });
}

export async function equipCosmeticAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const type = str(fd, 'type') as CosmeticType;
    if (!TYPES.includes(type)) return fail('Tipo inválido.');
    const raw = str(fd, 'cosmeticId');
    const id = raw ? raw : null;
    if (id && !COSMETICS.some((x) => x.id === id)) return fail('Cosmético desconhecido.');
    await equipCosmetic(c.id, type, id);
    revalidatePath(SITE_PATHS.cosmeticos);
    revalidatePath(SITE_PATHS.perfil);
    const def = id ? COSMETICS.find((x) => x.id === id) : null;
    return done(def ? `${def.name} equipado.` : 'Removido.');
  });
}
