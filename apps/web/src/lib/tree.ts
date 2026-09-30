import {
  AWAKENING_MISSIONS,
  getSkill,
  nodeState,
  resolveSkill,
  type LineageDef,
  type NodeState,
  type TreeNodeType,
} from '@ego/content';

export interface SkillInfo {
  id: string;
  name: string;
  lineageId: string;
  kind: 'active' | 'flow';
  reaction: boolean;
  stamina: number;
  cooldown: number;
  text: string;
  counterplay: string;
  when: string;
}

export interface TreeNodeView {
  id: string;
  name: string;
  type: TreeNodeType;
  cost: number;
  requires: string | null;
  requiresName: string | null;
  branchName: string | null;
  col: number;
  row: number;
  state: NodeState;
  skill: SkillInfo | null;
  evolution: { skillName: string; before: string; after: string } | null;
  awakening: { name: string; description: string; progress: number; target: number; completed: boolean } | null;
}

export interface TreeView {
  lineageId: string;
  rows: number;
  cols: number;
  nodes: TreeNodeView[];
}

function skillInfo(skillId: string, owned: string[]): SkillInfo {
  const r = resolveSkill(skillId, owned);
  const def = getSkill(skillId);
  return {
    id: def.id,
    name: def.name,
    lineageId: def.lineageId,
    kind: def.kind,
    reaction: !!def.reaction,
    stamina: r.stamina,
    cooldown: r.cooldown,
    text: def.describe(r.params, { stamina: r.stamina, cooldown: r.cooldown }),
    counterplay: def.counterplay,
    when: def.ai.when,
  };
}

/**
 * Monta a árvore para exibição. Textos de efeito vêm do describe() de cada
 * habilidade, com os números já ajustados pelas evoluções compradas.
 */
export function buildTree(
  lineage: LineageDef,
  owned: string[],
  completedAwakenings: string[],
  missions: { id: string; progress: number; target: number; completed: boolean }[],
): TreeView {
  const rows = Math.max(1, lineage.branches.length);
  const nodes: TreeNodeView[] = [];
  const nameOf = (id: string | undefined) => {
    if (!id) return null;
    if (id === lineage.startNode.id) return lineage.startNode.name;
    for (const b of lineage.branches) for (const n of b.nodes) if (n.id === id) return n.name;
    return null;
  };
  const start = lineage.startNode;
  nodes.push({
    id: start.id,
    name: start.name,
    type: start.type,
    cost: start.cost,
    requires: null,
    requiresName: null,
    branchName: null,
    col: 0,
    row: (rows - 1) / 2,
    state: 'comprado',
    skill: start.grantsSkill ? skillInfo(start.grantsSkill, owned) : null,
    evolution: null,
    awakening: null,
  });
  let cols = 1;
  lineage.branches.forEach((b, row) => {
    b.nodes.forEach((n, i) => {
      cols = Math.max(cols, i + 2);
      let evolution: TreeNodeView['evolution'] = null;
      if (n.evolves) {
        const sk = n.evolves.skillId;
        const withoutThis = owned.filter((x) => x !== n.id);
        const withThis = [...withoutThis, n.id];
        evolution = {
          skillName: getSkill(sk).name,
          before: skillInfo(sk, withoutThis).text,
          after: skillInfo(sk, withThis).text,
        };
      }
      let awakening: TreeNodeView['awakening'] = null;
      if (n.awakeningMission) {
        const def = AWAKENING_MISSIONS.find((m) => m.id === n.awakeningMission);
        const prog = missions.find((m) => m.id === n.awakeningMission);
        awakening = {
          name: def?.name ?? n.awakeningMission,
          description: def?.description ?? '',
          progress: prog?.progress ?? 0,
          target: prog?.target ?? def?.target ?? 0,
          completed: prog?.completed ?? completedAwakenings.includes(n.awakeningMission),
        };
      }
      nodes.push({
        id: n.id,
        name: n.name,
        type: n.type,
        cost: n.cost,
        requires: n.requires ?? start.id,
        requiresName: nameOf(n.requires) ?? null,
        branchName: i === 0 ? b.name : null,
        col: i + 1,
        row,
        state: nodeState(n, owned, completedAwakenings),
        skill: n.grantsSkill ? skillInfo(n.grantsSkill, owned) : n.evolves ? skillInfo(n.evolves.skillId, owned) : null,
        evolution,
        awakening,
      });
    });
  });
  return { lineageId: lineage.id, rows, cols, nodes };
}

export const NODE_TYPE_LABEL: Record<TreeNodeType, string> = {
  flow_start: 'Flow inicial',
  skill: 'Habilidade',
  evolution: 'Evolução',
  awakening: 'Despertar',
};

export const NODE_STATE_LABEL: Record<NodeState, string> = {
  comprado: 'Liberado',
  disponivel: 'Disponível',
  bloqueado: 'Bloqueado',
  despertar_pendente: 'Despertar pendente',
};
