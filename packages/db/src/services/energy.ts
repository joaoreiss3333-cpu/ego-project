import { ENERGY } from '@ego/content';
import type { Character } from '@prisma/client';
import { prisma } from '../client';
import { GameError } from '../errors';
import { formatDuration } from '../time';

const REGEN_MS = ENERGY.regenHours * 3600_000;

/** Energia atual (recarga de 1 a cada N horas, até o máximo). */
export function currentEnergy(c: Pick<Character, 'energy' | 'energyUpdatedAt'>, now = Date.now()) {
  const elapsed = now - c.energyUpdatedAt.getTime();
  const gained = Math.floor(elapsed / REGEN_MS);
  const energy = Math.min(ENERGY.max, c.energy + gained);
  const anchor = energy >= ENERGY.max ? now : c.energyUpdatedAt.getTime() + gained * REGEN_MS;
  const nextInMs = energy >= ENERGY.max ? 0 : anchor + REGEN_MS - now;
  return { energy, max: ENERGY.max, nextInMs, anchor: new Date(anchor) };
}

/** Gasta energia de treino. Lança erro com o tempo da próxima recarga. */
export async function spendEnergy(characterId: string, amount: number = ENERGY.trainingCost) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const e = currentEnergy(c);
    if (e.energy < amount) throw new GameError('no_energy', `Energia de treino esgotada. A próxima recarga é em ${formatDuration(e.nextInMs)}.`);
    const updated = await tx.character.updateMany({
      where: { id: characterId, energyUpdatedAt: c.energyUpdatedAt },
      data: { energy: e.energy - amount, energyUpdatedAt: e.energy >= ENERGY.max ? new Date() : e.anchor },
    });
    if (updated.count !== 1) throw new GameError('retry', 'Tente de novo em alguns segundos.');
    return currentEnergy({ energy: e.energy - amount, energyUpdatedAt: e.energy >= ENERGY.max ? new Date() : e.anchor });
  });
}

/** Devolve energia (treino cancelado por erro do sistema). */
export async function refundEnergy(characterId: string, amount: number = ENERGY.trainingCost) {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const e = currentEnergy(c);
  await prisma.character.update({ where: { id: characterId }, data: { energy: Math.min(ENERGY.max, e.energy + amount), energyUpdatedAt: e.anchor } });
}
