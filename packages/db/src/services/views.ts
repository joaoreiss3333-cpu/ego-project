import {
  PROGRESSION,
  allTreeNodes,
  findLineage,
  getSkill,
  masteryLevel,
  nodeState,
  unlockedSkills,
  xpForLevel,
  type Attrs,
  type LineageDef,
  type NodeState,
  type TreeNode,
} from '@ego/content';
import type { Character, InventoryItem, LineageProgress, SkillMastery } from '@prisma/client';
import { prisma } from '../client';
import { attrUpgradeCost, capsOf, completedAwakenings, effectiveAttrs, lineageProgress, type AttrCost, type Build } from './character';
import { currentEnergy } from './energy';
import { marketValueNow } from './matches';
import { attrsOf, tokensOf } from './progression';
import { rankPosition } from './ranking';

export interface ProfileView {
  character: Character;
  lineage: LineageDef | null;
  caps: Attrs;
  base: Attrs;
  effective: Attrs;
  tokens: Attrs;
  costs: AttrCost[];
  xpNeeded: number;
  maxLevel: boolean;
  energy: ReturnType<typeof currentEnergy>;
  marketValue: number;
  progress: LineageProgress | null;
  tree: { node: TreeNode; state: NodeState; branchId: string | null; branchName: string | null }[];
  unlocked: string[];
  awakenings: string[];
  items: InventoryItem[];
  mastery: (SkillMastery & { level: number; name: string; lineageId: string })[];
  rank: { solo: Awaited<ReturnType<typeof rankPosition>>; time: Awaited<ReturnType<typeof rankPosition>> };
  builds: Build[];
  ownedLineages: string[];
}

export async function profileView(characterId: string): Promise<ProfileView> {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const [items, mastery, lineages, awak, progress] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { characterId } }),
    prisma.skillMastery.findMany({ where: { characterId }, orderBy: { uses: 'desc' } }),
    prisma.lineageProgress.findMany({ where: { characterId } }),
    prisma.$transaction((tx) => completedAwakenings(tx, characterId)),
    c.lineageId ? prisma.$transaction((tx) => lineageProgress(tx, characterId, c.lineageId!)) : Promise.resolve(null),
  ]);
  const lineage = findLineage(c.lineageId) ?? null;
  const tree: ProfileView['tree'] = [];
  if (lineage) {
    const owned = progress?.nodes ?? [];
    tree.push({ node: lineage.startNode, state: 'comprado', branchId: null, branchName: null });
    for (const b of lineage.branches) for (const n of b.nodes) tree.push({ node: n, state: nodeState(n, owned, awak), branchId: b.id, branchName: b.name });
  }
  const [solo, time] = await Promise.all([rankPosition(characterId, c.guildId, 'solo'), rankPosition(characterId, c.guildId, 'time')]);
  return {
    character: c,
    lineage,
    caps: capsOf(c),
    base: attrsOf(c),
    effective: effectiveAttrs(c, items),
    tokens: tokensOf(c),
    costs: (Object.keys(attrsOf(c)) as (keyof Attrs)[]).map((k) => attrUpgradeCost(c, k)),
    xpNeeded: c.level >= PROGRESSION.maxLevel ? 0 : xpForLevel(c.level),
    maxLevel: c.level >= PROGRESSION.maxLevel,
    energy: currentEnergy(c),
    marketValue: marketValueNow(c),
    progress,
    tree,
    unlocked: lineage ? unlockedSkills(lineage.id, progress?.nodes ?? []) : [],
    awakenings: awak,
    items,
    mastery: mastery.map((m) => {
      const def = getSkill(m.skillId);
      return { ...m, level: masteryLevel(m.uses), name: def.name, lineageId: def.lineageId };
    }),
    rank: { solo, time },
    builds: ((progress?.builds as unknown as Build[]) ?? []) as Build[],
    ownedLineages: lineages.map((l) => l.lineageId),
  };
}

export { allTreeNodes };
