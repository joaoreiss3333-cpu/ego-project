import {
  ATTRS,
  COLORS,
  PROGRESSION,
  allTreeNodes,
  getLineage,
  getSkill,
  unlockedSkills,
  type AttrKey,
  type Attrs,
  type BotSpec,
  type Difficulty,
  type Position,
} from '@ego/content';
import type { SlotSetup, Team } from './types';

/** Prioridade de atributos por posição (desempate depois do teto da linhagem). */
const POSITION_PRIORITY: Record<Position, AttrKey[]> = {
  atacante: ['chute', 'drible', 'velocidade', 'visao', 'passe', 'fisico', 'defesa'],
  meio: ['passe', 'visao', 'drible', 'velocidade', 'defesa', 'chute', 'fisico'],
  defensor: ['defesa', 'fisico', 'visao', 'velocidade', 'passe', 'drible', 'chute'],
  goleiro: ['fisico', 'visao', 'defesa', 'velocidade', 'passe', 'drible', 'chute'],
};

/**
 * Distribui os pontos de um bot: sobe primeiro os atributos com teto alto
 * na linhagem, na ordem da posição. Bots não pagam fichas.
 */
export function distributeAttrs(lineageId: string, level: number, position: Position): Attrs {
  const caps = getLineage(lineageId).caps;
  const a = Object.fromEntries(ATTRS.map((k) => [k, PROGRESSION.attrStart])) as Attrs;
  let points = Math.max(0, level - 1) * PROGRESSION.attributePointsPerLevel;
  const prio = POSITION_PRIORITY[position];
  // ordem: posição primeiro, teto da linhagem desempata (um atacante Gagamaru ainda prioriza Chute)
  const score = (k: AttrKey) => caps[k] * 1.2 - prio.indexOf(k);
  const order = [...ATTRS].sort((x, y) => score(y) - score(x));
  // fase 1: os 3 principais em rodadas até o teto; fase 2: o resto em rodadas
  const spend = (keys: AttrKey[]) => {
    while (points > 0) {
      let moved = false;
      for (const k of keys) {
        if (points <= 0) break;
        if (a[k] >= Math.min(caps[k], PROGRESSION.attrMax)) continue;
        a[k]++;
        points--;
        moved = true;
      }
      if (!moved) break;
    }
  };
  spend(order.slice(0, 3));
  spend(order.slice(3));
  return a;
}

/** Compra nós na ordem dos ramos com os Pontos de Linhagem do nível. */
export function botNodes(lineageId: string, level: number, allowAwakening: boolean): string[] {
  const l = getLineage(lineageId);
  let points = Math.floor(level / PROGRESSION.lineagePointEvery);
  const owned: string[] = [];
  const nodes = allTreeNodes(l).filter((n) => n.type !== 'flow_start');
  let progress = true;
  while (progress) {
    progress = false;
    // prioridade: habilidades novas antes de evoluções
    const avail = nodes
      .filter((n) => !owned.includes(n.id) && (!n.requires || owned.includes(n.requires)))
      .filter((n) => allowAwakening || n.type !== 'awakening')
      .sort((a, b) => (a.type === 'skill' ? 0 : 1) - (b.type === 'skill' ? 0 : 1) || a.cost - b.cost);
    for (const n of avail) {
      if (n.cost <= points) {
        owned.push(n.id);
        points -= n.cost;
        progress = true;
        break;
      }
    }
  }
  return owned;
}

/** Loadout do bot: as 3 ativas de maior prioridade e o Flow mais forte. */
export function botLoadout(lineageId: string, nodes: string[]): { active: string[]; flow: string } {
  const unlocked = unlockedSkills(lineageId, nodes).map(getSkill);
  const actives = unlocked.filter((s) => s.kind === 'active').sort((a, b) => b.ai.priority - a.ai.priority);
  const flows = unlocked.filter((s) => s.kind === 'flow').sort((a, b) => b.ai.priority - a.ai.priority);
  return { active: actives.slice(0, 3).map((s) => s.id), flow: flows[0]?.id ?? getLineage(lineageId).startNode.grantsSkill! };
}

export function botSlot(spec: BotSpec, id: string, team: Team, difficulty: Difficulty, isKeeper = false): SlotSetup {
  const position: Position = isKeeper ? 'goleiro' : spec.position;
  const nodes = spec.nodes ?? botNodes(spec.lineageId, spec.level, difficulty === 'chefe');
  const loadout = spec.loadout ?? botLoadout(spec.lineageId, nodes);
  return {
    id,
    team,
    isKeeper,
    name: spec.name,
    number: 1 + (Math.abs(hash(spec.name)) % 98),
    characterId: null,
    isBot: true,
    position,
    lineageId: spec.lineageId,
    level: spec.level,
    attrs: distributeAttrs(spec.lineageId, spec.level, position),
    nodes,
    loadout,
    mastery: {},
    personality: spec.personality,
    difficulty,
    color: team === 'A' ? COLORS.teamA : COLORS.teamB,
  };
}

/** Goleiro bot: nível acompanha a média dos jogadores da partida. */
export function keeperSlot(id: string, team: Team, avgLevel: number, difficulty: Difficulty = 'regular'): SlotSetup {
  const level = Math.max(1, Math.round(avgLevel));
  return botSlot(
    { name: team === 'A' ? 'Goleiro A' : 'Goleiro B', lineageId: 'kuon', level, personality: 'cauteloso', position: 'goleiro' },
    id,
    team,
    difficulty,
    true,
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
