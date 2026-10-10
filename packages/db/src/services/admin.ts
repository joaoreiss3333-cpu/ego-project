import { DEFAULT_RARITY_BUDGET, MATCH_RULES, type MatchMode } from '@ego/content';
import { prisma } from '../client';
import { ERR } from '../errors';

export interface GuildSettings {
  planSeconds: number;
  gifEnabled: boolean;
  rarityBudget: Record<MatchMode, number>;
}

export async function guildSettings(guildId: string): Promise<GuildSettings> {
  const g = await prisma.guildConfig.findUnique({ where: { guildId } });
  return {
    planSeconds: g?.planSeconds ?? MATCH_RULES.planSeconds.default,
    gifEnabled: g?.gifEnabled ?? true,
    rarityBudget: { ...DEFAULT_RARITY_BUDGET, ...((g?.rarityBudget as Partial<Record<MatchMode, number>> | null) ?? {}) },
  };
}

export async function updateGuildSettings(guildId: string, adminId: string, patch: Partial<{ planSeconds: number; gifEnabled: boolean; mode: MatchMode; budget: number }>) {
  const cur = await guildSettings(guildId);
  if (patch.planSeconds !== undefined) {
    const { min, max } = MATCH_RULES.planSeconds;
    if (patch.planSeconds < min || patch.planSeconds > max) throw ERR.invalid(`O tempo do lance vai de ${min} a ${max} segundos.`);
    cur.planSeconds = patch.planSeconds;
  }
  if (patch.gifEnabled !== undefined) cur.gifEnabled = patch.gifEnabled;
  if (patch.mode && patch.budget !== undefined) {
    if (patch.budget < 1 || patch.budget > 50) throw ERR.invalid('Orçamento inválido.');
    cur.rarityBudget[patch.mode] = patch.budget;
  }
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, planSeconds: cur.planSeconds, gifEnabled: cur.gifEnabled, rarityBudget: cur.rarityBudget },
    update: { planSeconds: cur.planSeconds, gifEnabled: cur.gifEnabled, rarityBudget: cur.rarityBudget },
  });
  await log(guildId, adminId, 'config', null, patch);
  return cur;
}

export async function log(guildId: string, adminId: string, action: string, targetId: string | null, payload: unknown) {
  await prisma.adminLog.create({ data: { guildId, adminId, action, targetId, payload: payload as never } });
}

export async function giveCurrency(guildId: string, adminId: string, discordId: string, currency: 'coins' | 'ienes', amount: number) {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) throw ERR.invalid('Quantidade inválida.');
  const c = await prisma.character.findUnique({ where: { discordId } });
  if (!c) throw ERR.invalid('Esse jogador ainda não tem personagem.');
  const updated = await prisma.character.update({ where: { id: c.id }, data: { [currency]: Math.max(0, c[currency] + amount) } });
  await log(guildId, adminId, `dar-${currency}`, c.id, { amount });
  return updated;
}

/** Apaga o personagem (e tudo ligado a ele). O jogador cria de novo do zero. */
export async function resetCharacter(guildId: string, adminId: string, discordId: string) {
  const c = await prisma.character.findUnique({ where: { discordId } });
  if (!c) throw ERR.invalid('Esse jogador não tem personagem.');
  await prisma.character.delete({ where: { id: c.id } });
  await log(guildId, adminId, 'resetar-personagem', c.id, { name: c.name });
}
