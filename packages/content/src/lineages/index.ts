import type { LineageDef, SkillDef, TreeNode } from '../types';
import { kuon } from './kuon';
import { gagamaru } from './gagamaru';
import { chigiri } from './chigiri';
import { isagi } from './isagi';
import { lavinho } from './lavinho';

/**
 * Registro de linhagens. Para adicionar uma linhagem nova:
 * 1. crie `lineages/<id>.ts` exportando um LineageDef;
 * 2. acrescente-o nesta lista.
 * Nada mais precisa mudar: motor, IA, giro, site e guias leem daqui.
 */
export const LINEAGES: LineageDef[] = [kuon, gagamaru, chigiri, isagi, lavinho];

const byId = new Map(LINEAGES.map((l) => [l.id, l]));
const skillById = new Map<string, SkillDef>();
const nodeById = new Map<string, { lineage: LineageDef; node: TreeNode; branchId: string | null }>();
for (const l of LINEAGES) {
  for (const s of l.skills) {
    if (skillById.has(s.id)) throw new Error(`Habilidade duplicada: ${s.id}`);
    skillById.set(s.id, s);
  }
  nodeById.set(l.startNode.id, { lineage: l, node: l.startNode, branchId: null });
  for (const b of l.branches) for (const n of b.nodes) nodeById.set(n.id, { lineage: l, node: n, branchId: b.id });
}

export function getLineage(id: string): LineageDef {
  const l = byId.get(id);
  if (!l) throw new Error(`Linhagem desconhecida: ${id}`);
  return l;
}

export function findLineage(id: string | null | undefined): LineageDef | undefined {
  return id ? byId.get(id) : undefined;
}

export function getSkill(id: string): SkillDef {
  const s = skillById.get(id);
  if (!s) throw new Error(`Habilidade desconhecida: ${id}`);
  return s;
}

export function findSkill(id: string | null | undefined): SkillDef | undefined {
  return id ? skillById.get(id) : undefined;
}

export function allSkills(): SkillDef[] {
  return [...skillById.values()];
}

export function getTreeNode(id: string) {
  return nodeById.get(id);
}

export function allTreeNodes(lineage: LineageDef): TreeNode[] {
  return [lineage.startNode, ...lineage.branches.flatMap((b) => b.nodes)];
}

/** Habilidade com os números já ajustados pelas evoluções compradas. */
export interface ResolvedSkill {
  def: SkillDef;
  id: string;
  name: string;
  kind: 'active' | 'flow';
  stamina: number;
  cooldown: number;
  params: Record<string, number>;
}

export function resolveSkill(skillId: string, ownedNodes: string[]): ResolvedSkill {
  const def = getSkill(skillId);
  const params = { ...def.params };
  let stamina = def.stamina;
  let cooldown = def.cooldown;
  const lineage = getLineage(def.lineageId);
  for (const n of allTreeNodes(lineage)) {
    if (!ownedNodes.includes(n.id) || !n.evolves || n.evolves.skillId !== skillId) continue;
    Object.assign(params, n.evolves.params ?? {});
    if (n.evolves.stamina !== undefined) stamina = n.evolves.stamina;
    if (n.evolves.cooldown !== undefined) cooldown = n.evolves.cooldown;
  }
  return { def, id: def.id, name: def.name, kind: def.kind, stamina, cooldown, params };
}

/** Habilidades desbloqueadas pela árvore (o nó inicial é sempre dono). */
export function unlockedSkills(lineageId: string, ownedNodes: string[]): string[] {
  const l = getLineage(lineageId);
  const owned = new Set([l.startNode.id, ...ownedNodes]);
  return allTreeNodes(l)
    .filter((n) => owned.has(n.id) && n.grantsSkill)
    .map((n) => n.grantsSkill!) as string[];
}

export type NodeState = 'comprado' | 'disponivel' | 'bloqueado' | 'despertar_pendente';

/**
 * Estado de um nó para exibição e validação.
 * `completedAwakenings` são ids de missões de despertar já concluídas com esta linhagem.
 */
export function nodeState(node: TreeNode, ownedNodes: string[], completedAwakenings: string[]): NodeState {
  if (node.type === 'flow_start' || ownedNodes.includes(node.id)) return 'comprado';
  if (node.requires && !ownedNodes.includes(node.requires)) return 'bloqueado';
  if (node.awakeningMission && !completedAwakenings.includes(node.awakeningMission)) return 'despertar_pendente';
  return 'disponivel';
}

/** Loadout padrão: flow inicial e até 3 ativas desbloqueadas. */
export function defaultLoadout(lineageId: string, ownedNodes: string[]) {
  const unlocked = unlockedSkills(lineageId, ownedNodes);
  const flows = unlocked.filter((s) => getSkill(s).kind === 'flow');
  const actives = unlocked.filter((s) => getSkill(s).kind === 'active');
  return { active: actives.slice(0, 3), flow: flows[flows.length - 1] ?? getLineage(lineageId).startNode.grantsSkill! };
}

/** Total de Pontos de Linhagem gastos na árvore. */
export function spentLineagePoints(lineageId: string, ownedNodes: string[]): number {
  return allTreeNodes(getLineage(lineageId))
    .filter((n) => ownedNodes.includes(n.id))
    .reduce((acc, n) => acc + n.cost, 0);
}

export { kuon, gagamaru, chigiri, isagi, lavinho };
