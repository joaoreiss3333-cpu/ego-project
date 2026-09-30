import { SELECTION_GROUPS, allStages, getStage, isStageUnlocked, type Reward } from '@ego/content';
import { Rng } from '@ego/engine';
import { randomBytes } from 'node:crypto';
import { prisma, type Tx } from '../client';
import { grantReward, mergeRewards, type AppliedReward } from './progression';

export async function selectionStatus(characterId: string) {
  const rows = await prisma.selectionProgress.findMany({ where: { characterId } });
  const cleared = rows.filter((r) => r.firstClearAt).map((r) => r.stageId);
  return SELECTION_GROUPS.map((g) => ({
    group: g,
    completed: g.stages.every((s) => cleared.includes(s.id)),
    stages: g.stages.map((s) => {
      const r = rows.find((x) => x.stageId === s.id);
      return {
        stage: s,
        unlocked: isStageUnlocked(s.id, cleared),
        cleared: !!r?.firstClearAt,
        wins: r?.wins ?? 0,
        attempts: r?.attempts ?? 0,
      };
    }),
  }));
}

export async function assertStageUnlocked(characterId: string, stageId: string): Promise<boolean> {
  const rows = await prisma.selectionProgress.findMany({ where: { characterId, firstClearAt: { not: null } } });
  return isStageUnlocked(stageId, rows.map((r) => r.stageId));
}

export interface SelectionOutcome {
  first: boolean;
  reward: AppliedReward | null;
  drop: string | null;
  groupCompleted: string | null;
}

/** Registra o resultado de uma etapa para um participante humano. */
export async function recordSelection(tx: Tx, characterId: string, stageId: string, won: boolean): Promise<SelectionOutcome> {
  const stage = getStage(stageId);
  const prev = await tx.selectionProgress.findUnique({ where: { characterId_stageId: { characterId, stageId } } });
  const first = won && !prev?.firstClearAt;
  await tx.selectionProgress.upsert({
    where: { characterId_stageId: { characterId, stageId } },
    create: { characterId, stageId, attempts: 1, wins: won ? 1 : 0, firstClearAt: first ? new Date() : null },
    update: { attempts: { increment: 1 }, wins: { increment: won ? 1 : 0 }, ...(first ? { firstClearAt: new Date() } : {}) },
  });
  if (!won) return { first: false, reward: null, drop: null, groupCompleted: null };
  let reward: Reward = first ? stage.firstReward : stage.repeatReward;
  let drop: string | null = null;
  if (!first && stage.dropItem && new Rng(randomBytes(8).toString('hex')).next() < stage.dropChance) {
    drop = stage.dropItem;
    reward = mergeRewards(reward, { items: [drop] });
  }
  // Primeira vitória da etapa-chefe também entrega a caneleira (drop garantido do chefe)
  if (first && stage.boss && stage.dropItem) {
    drop = stage.dropItem;
    reward = mergeRewards(reward, { items: [drop] });
  }
  let groupCompleted: string | null = null;
  if (first) {
    const group = SELECTION_GROUPS.find((g) => g.id === stage.groupId)!;
    const clearedRows = await tx.selectionProgress.findMany({ where: { characterId, firstClearAt: { not: null } } });
    const cleared = new Set(clearedRows.map((r) => r.stageId));
    if (group.stages.every((s) => cleared.has(s.id))) {
      groupCompleted = group.id;
      if (group.completionCosmetic) reward = mergeRewards(reward, { cosmetics: [group.completionCosmetic] });
    }
  }
  const applied = await grantReward(tx, characterId, reward);
  return { first, reward: applied, drop, groupCompleted };
}

export { allStages };
