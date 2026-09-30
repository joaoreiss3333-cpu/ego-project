import {
  ATTRS,
  PROGRESSION,
  allTreeNodes,
  defaultLoadout,
  findLineage,
  getEquipment,
  getLineage,
  getSkill,
  nodeState,
  tokenCostForAttr,
  unlockedSkills,
  type AttrKey,
  type Attrs,
  type Foot,
  type Position,
} from '@ego/content';
import type { Character, InventoryItem, LineageProgress } from '@prisma/client';
import { prisma, type Tx } from '../client';
import { ERR, GameError } from '../errors';
import { formatDuration } from '../time';
import { TOKEN_FIELD, attrsOf, tokensOf } from './progression';

/** Teto sem linhagem (antes do giro gratuito). */
export const NO_LINEAGE_CAP = 6;

export async function findCharacter(discordId: string) {
  return prisma.character.findUnique({ where: { discordId } });
}

export async function requireCharacter(discordId: string): Promise<Character> {
  const c = await findCharacter(discordId);
  if (!c) throw ERR.noCharacter();
  return c;
}

export function capsOf(c: Pick<Character, 'lineageId'>): Attrs {
  const l = findLineage(c.lineageId);
  if (l) return { ...l.caps };
  return Object.fromEntries(ATTRS.map((k) => [k, NO_LINEAGE_CAP])) as Attrs;
}

/** Bônus de equipamento por atributo (itens equipados). */
export function equipmentBonus(items: Pick<InventoryItem, 'itemId' | 'level' | 'equipped'>[]): Partial<Attrs> {
  const out: Partial<Attrs> = {};
  for (const it of items) {
    if (!it.equipped) continue;
    const def = getEquipment(it.itemId);
    out[def.attr] = (out[def.attr] ?? 0) + def.bonusByLevel[Math.min(2, Math.max(0, it.level))];
  }
  return out;
}

/** Atributos de jogo: base + equipamento, passando do teto em no máximo +1. */
export function effectiveAttrs(c: Character, items: Pick<InventoryItem, 'itemId' | 'level' | 'equipped'>[]): Attrs {
  const base = attrsOf(c);
  const caps = capsOf(c);
  const bonus = equipmentBonus(items);
  const out = { ...base };
  for (const k of ATTRS) {
    const b = bonus[k] ?? 0;
    if (!b) continue;
    out[k] = Math.min(base[k] + b, Math.max(base[k], caps[k] + PROGRESSION.equipmentOverCap));
  }
  return out;
}

export interface CreateCharacterInput {
  discordId: string;
  guildId: string;
  discordName: string;
  name: string;
  number: number;
  position: Position;
  foot: Foot;
  tokenColor: string;
}

const POSITIONS: Position[] = ['atacante', 'meio', 'defensor', 'goleiro'];
const FEET: Foot[] = ['direito', 'esquerdo', 'ambos'];

export function validateCharacterInput(i: Omit<CreateCharacterInput, 'discordId' | 'guildId' | 'discordName'>): string | null {
  const name = i.name.trim();
  if (name.length < 2 || name.length > 20) return 'O nome precisa ter de 2 a 20 caracteres.';
  if (!/^[\p{L}\p{N} .'-]+$/u.test(name)) return 'Use só letras, números, espaço, ponto, hífen e apóstrofo no nome.';
  if (!Number.isInteger(i.number) || i.number < 1 || i.number > 99) return 'O número da camisa vai de 1 a 99.';
  if (!POSITIONS.includes(i.position)) return 'Posição inválida.';
  if (!FEET.includes(i.foot)) return 'Pé dominante inválido.';
  if (!/^#[0-9A-Fa-f]{6}$/.test(i.tokenColor)) return 'Cor inválida.';
  return null;
}

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  const problem = validateCharacterInput(input);
  if (problem) throw ERR.invalid(problem);
  const existing = await findCharacter(input.discordId);
  if (existing) throw ERR.hasCharacter();
  return prisma.character.create({
    data: {
      discordId: input.discordId,
      guildId: input.guildId,
      discordName: input.discordName,
      name: input.name.trim(),
      number: input.number,
      position: input.position,
      foot: input.foot,
      tokenColor: input.tokenColor.toUpperCase(),
      freeSpin: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Atributos
// ---------------------------------------------------------------------------

export interface AttrCost {
  attr: AttrKey;
  current: number;
  target: number;
  cap: number;
  points: number;
  tokens: number;
  tokensOwned: number;
  pointsOwned: number;
  ok: boolean;
  reason: string | null;
}

/** Custo de subir `attr` em 1 (mesma regra no bot e no site). */
export function attrUpgradeCost(c: Character, attr: AttrKey): AttrCost {
  const current = c[attr] as number;
  const cap = capsOf(c)[attr];
  const target = current + 1;
  const tokens = tokenCostForAttr(target);
  const tokensOwned = tokensOf(c)[attr];
  let reason: string | null = null;
  if (!c.lineageId && target > NO_LINEAGE_CAP) reason = 'Sem linhagem o teto é 6. Faça seu giro.';
  else if (target > Math.min(cap, PROGRESSION.attrMax)) reason = 'Esse atributo já está no teto da linhagem.';
  else if (c.attrPoints < 1) reason = 'Você não tem Pontos de Atributo.';
  else if (tokensOwned < tokens) reason = `Faltam ${tokens - tokensOwned} fichas.`;
  return { attr, current, target, cap, points: 1, tokens, tokensOwned, pointsOwned: c.attrPoints, ok: !reason, reason };
}

export async function allocateAttribute(characterId: string, attr: AttrKey): Promise<Character> {
  if (!ATTRS.includes(attr)) throw ERR.invalid('Atributo inválido.');
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const cost = attrUpgradeCost(c, attr);
    if (!cost.ok) throw ERR.invalid(cost.reason!);
    // atualização condicional: evita gastar duas vezes em cliques simultâneos
    const res = await tx.character.updateMany({
      where: { id: characterId, attrPoints: { gte: 1 }, [attr]: cost.current, [TOKEN_FIELD[attr]]: { gte: cost.tokens } },
      data: { attrPoints: { decrement: 1 }, [attr]: { increment: 1 }, [TOKEN_FIELD[attr]]: { decrement: cost.tokens } },
    });
    if (res.count !== 1) throw ERR.invalid('Os pontos mudaram enquanto você escolhia. Tente de novo.');
    return tx.character.findUniqueOrThrow({ where: { id: characterId } });
  });
}

/** Fichas gastas para chegar ao valor atual (reembolsadas no reset). */
export function tokensSpentFor(value: number): number {
  let total = 0;
  for (let v = PROGRESSION.freeUpTo + 1; v <= value; v++) total += tokenCostForAttr(v);
  return total;
}

function cooldownLeft(last: Date | null): number {
  if (!last) return 0;
  const ms = last.getTime() + PROGRESSION.reset.cooldownHours * 3600_000 - Date.now();
  return Math.max(0, ms);
}

export async function resetAttributes(characterId: string): Promise<Character> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const left = cooldownLeft(c.lastAttrResetAt);
    if (left > 0) throw ERR.cooldown(formatDuration(left));
    if (c.ienes < PROGRESSION.reset.attributesCost) throw ERR.notEnough('Ienes');
    const data: Record<string, unknown> = {
      ienes: { decrement: PROGRESSION.reset.attributesCost },
      lastAttrResetAt: new Date(),
    };
    let refundPoints = 0;
    for (const k of ATTRS) {
      const v = c[k] as number;
      refundPoints += v - PROGRESSION.attrStart;
      data[k] = PROGRESSION.attrStart;
      data[TOKEN_FIELD[k]] = { increment: tokensSpentFor(v) };
    }
    data.attrPoints = { increment: refundPoints };
    return tx.character.update({ where: { id: characterId }, data });
  });
}

// ---------------------------------------------------------------------------
// Linhagem, árvore e loadout
// ---------------------------------------------------------------------------

export async function lineageProgress(tx: Tx, characterId: string, lineageId: string): Promise<LineageProgress> {
  const found = await tx.lineageProgress.findUnique({ where: { characterId_lineageId: { characterId, lineageId } } });
  if (found) return found;
  const lo = defaultLoadout(lineageId, []);
  return tx.lineageProgress.create({ data: { characterId, lineageId, nodes: [], loadoutActive: lo.active, loadoutFlow: lo.flow } });
}

export async function completedAwakenings(tx: Tx, characterId: string): Promise<string[]> {
  const rows = await tx.missionProgress.findMany({ where: { characterId, periodKey: 'awakening', completed: true } });
  return rows.map((r) => r.missionId);
}

export async function buyNode(characterId: string, nodeId: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    if (!c.lineageId) throw ERR.noLineage();
    const lineage = getLineage(c.lineageId);
    const node = allTreeNodes(lineage).find((n) => n.id === nodeId);
    if (!node) throw ERR.invalid('Esse nó não pertence à sua linhagem equipada.');
    const lp = await lineageProgress(tx, characterId, c.lineageId);
    const awak = await completedAwakenings(tx, characterId);
    const st = nodeState(node, lp.nodes, awak);
    if (st === 'comprado') throw ERR.invalid('Você já tem esse nó.');
    if (st === 'bloqueado') throw ERR.invalid('Compre o nó anterior do ramo primeiro.');
    if (st === 'despertar_pendente') throw ERR.invalid('Complete a missão de Despertar desta linhagem primeiro.');
    if (c.lineagePoints < node.cost) throw ERR.notEnough('Pontos de Linhagem');
    const res = await tx.character.updateMany({ where: { id: characterId, lineagePoints: { gte: node.cost } }, data: { lineagePoints: { decrement: node.cost } } });
    if (res.count !== 1) throw ERR.notEnough('Pontos de Linhagem');
    const nodes = [...lp.nodes, node.id];
    // habilidade nova entra no loadout se houver espaço
    const data: { nodes: string[]; loadoutActive?: string[]; loadoutFlow?: string } = { nodes };
    if (node.grantsSkill) {
      const sk = getSkill(node.grantsSkill);
      if (sk.kind === 'active' && lp.loadoutActive.length < 3) data.loadoutActive = [...lp.loadoutActive, sk.id];
    }
    return tx.lineageProgress.update({ where: { id: lp.id }, data });
  });
}

export async function resetTree(characterId: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    if (!c.lineageId) throw ERR.noLineage();
    const left = cooldownLeft(c.lastTreeResetAt);
    if (left > 0) throw ERR.cooldown(formatDuration(left));
    if (c.ienes < PROGRESSION.reset.treeCost) throw ERR.notEnough('Ienes');
    const lp = await lineageProgress(tx, characterId, c.lineageId);
    const lineage = getLineage(c.lineageId);
    const refund = allTreeNodes(lineage)
      .filter((n) => lp.nodes.includes(n.id))
      .reduce((a, n) => a + n.cost, 0);
    const lo = defaultLoadout(c.lineageId, []);
    await tx.lineageProgress.update({ where: { id: lp.id }, data: { nodes: [], loadoutActive: lo.active, loadoutFlow: lo.flow } });
    return tx.character.update({
      where: { id: characterId },
      data: { lineagePoints: { increment: refund }, ienes: { decrement: PROGRESSION.reset.treeCost }, lastTreeResetAt: new Date() },
    });
  });
}

export function validateLoadout(lineageId: string, nodes: string[], active: string[], flow: string): string | null {
  const unlocked = unlockedSkills(lineageId, nodes);
  if (active.length > 3) return 'No máximo 3 habilidades ativas.';
  if (new Set(active).size !== active.length) return 'Habilidade repetida no loadout.';
  for (const a of active) {
    if (!unlocked.includes(a)) return 'Habilidade ainda não desbloqueada.';
    if (getSkill(a).kind !== 'active') return 'Só habilidades ativas nos 3 espaços.';
  }
  if (!unlocked.includes(flow) || getSkill(flow).kind !== 'flow') return 'Escolha uma habilidade de Flow desbloqueada.';
  return null;
}

export async function setLoadout(characterId: string, active: string[], flow: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    if (!c.lineageId) throw ERR.noLineage();
    const lp = await lineageProgress(tx, characterId, c.lineageId);
    const problem = validateLoadout(c.lineageId, lp.nodes, active, flow);
    if (problem) throw ERR.invalid(problem);
    return tx.lineageProgress.update({ where: { id: lp.id }, data: { loadoutActive: active, loadoutFlow: flow } });
  });
}

export interface Build {
  name: string;
  active: string[];
  flow: string;
}

export async function saveBuild(characterId: string, build: Build) {
  const name = build.name.trim().slice(0, 24);
  if (!name) throw ERR.invalid('Dê um nome para a build.');
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    if (!c.lineageId) throw ERR.noLineage();
    const lp = await lineageProgress(tx, characterId, c.lineageId);
    const problem = validateLoadout(c.lineageId, lp.nodes, build.active, build.flow);
    if (problem) throw ERR.invalid(problem);
    const builds = ((lp.builds as unknown as Build[]) ?? []).filter((b) => b.name !== name);
    if (builds.length >= 6) throw ERR.invalid('Limite de 6 builds por linhagem.');
    builds.push({ name, active: build.active, flow: build.flow });
    return tx.lineageProgress.update({ where: { id: lp.id }, data: { builds: builds as never } });
  });
}

export async function deleteBuild(characterId: string, name: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    if (!c.lineageId) throw ERR.noLineage();
    const lp = await lineageProgress(tx, characterId, c.lineageId);
    const builds = ((lp.builds as unknown as Build[]) ?? []).filter((b) => b.name !== name);
    return tx.lineageProgress.update({ where: { id: lp.id }, data: { builds: builds as never } });
  });
}

export async function setPortrait(characterId: string, path: string | null) {
  return prisma.character.update({ where: { id: characterId }, data: { portraitPath: path } });
}

export async function requireLineage(c: Character): Promise<string> {
  if (!c.lineageId) throw ERR.noLineage();
  return c.lineageId;
}

export { GameError };
