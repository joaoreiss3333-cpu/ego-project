import type { SendableChannels } from 'discord.js';
import { MMR, RARITY_COST, getLineage, rankGroupForMode, type MatchMode } from '@ego/content';
import { findCharacter, getRating, guildSettings, prisma, type Character } from '@ego/db';
import { on } from '../router';
import { screen, text } from '../ui';
import { replyError } from '../util/reply';
import { busyReason } from './lobby';
import { startMatch } from './start';

interface Entry {
  userId: string;
  character: Character;
  mmr: number;
  channel: SendableChannels;
  since: number;
}

/** Fila por servidor e modo. */
const queues = new Map<string, Entry[]>();
export const queuedUser = new Map<string, string>();

const key = (guildId: string, mode: MatchMode) => `${guildId}:${mode}`;

function range(oldest: number): number {
  const minutes = (Date.now() - oldest) / 60_000;
  return MMR.queueInitialRange + minutes * MMR.queueRangeGrowthPerMinute;
}

/** Melhor divisão em dois times: menor diferença de MMR respeitando o orçamento. */
export function splitTeams<T extends { mmr: number; cost: number }>(xs: T[], n: number, budget: number): { A: T[]; B: T[] } | null {
  let best: { A: T[]; B: T[]; diff: number } | null = null;
  const total = xs.length;
  for (let mask = 0; mask < 1 << total; mask++) {
    let bits = 0;
    for (let k = 0; k < total; k++) if (mask & (1 << k)) bits++;
    if (bits !== n || !(mask & 1)) continue; // fixa o primeiro no time A (evita duplicar)
    const A = xs.filter((_, k) => mask & (1 << k));
    const B = xs.filter((_, k) => !(mask & (1 << k)));
    const cost = (t: T[]) => t.reduce((a, x) => a + x.cost, 0);
    if (cost(A) > budget || cost(B) > budget) continue;
    const avg = (t: T[]) => t.reduce((a, x) => a + x.mmr, 0) / t.length;
    const diff = Math.abs(avg(A) - avg(B));
    if (!best || diff < best.diff) best = { A, B, diff };
  }
  return best ? { A: best.A, B: best.B } : null;
}

async function tryMatch(guildId: string, mode: MatchMode) {
  const q = queues.get(key(guildId, mode)) ?? [];
  const n = Number(mode[0]);
  if (q.length < n * 2) return;
  const settings = await guildSettings(guildId);
  const sorted = [...q].sort((a, b) => a.mmr - b.mmr);
  for (let i = 0; i + n * 2 <= sorted.length; i++) {
    const group = sorted.slice(i, i + n * 2);
    const oldest = Math.min(...group.map((g) => g.since));
    if (group[group.length - 1].mmr - group[0].mmr > range(oldest)) continue;
    const withCost = group.map((g) => ({ ...g, cost: RARITY_COST[getLineage(g.character.lineageId!).rarity] }));
    const split = splitTeams(withCost, n, settings.rarityBudget[mode]);
    if (!split) continue;
    // tira da fila e inicia
    queues.set(
      key(guildId, mode),
      q.filter((e) => !group.includes(e)),
    );
    for (const g of group) queuedUser.delete(g.userId);
    const channel = group.sort((a, b) => a.since - b.since)[0].channel;
    await channel.send(screen({ accent: 'padrao', blocks: [text(`### Fila ranqueada ${mode}\nPartida encontrada: ${group.map((g) => `<@${g.userId}>`).join(' ')}`)] }));
    await startMatch({
      guildId,
      channel,
      mode,
      kind: 'ranqueada',
      teamA: split.A.map((x) => ({ userId: x.userId, character: x.character })),
      teamB: split.B.map((x) => ({ userId: x.userId, character: x.character })),
      label: `${mode} · Ranqueada`,
    });
    return;
  }
}

setInterval(() => {
  for (const k of queues.keys()) {
    const [guildId, mode] = k.split(':') as [string, MatchMode];
    tryMatch(guildId, mode).catch((e) => console.error('[fila]', e));
  }
}, 10_000).unref();

on.command('fila', async (i) => {
  const sub = i.options.getSubcommand();
  if (sub === 'sair') {
    const k = queuedUser.get(i.user.id);
    if (!k) return replyError(i, 'Você não está na fila.');
    queues.set(
      k,
      (queues.get(k) ?? []).filter((e) => e.userId !== i.user.id),
    );
    queuedUser.delete(i.user.id);
    return i.reply(screen({ accent: 'padrao', blocks: [text('Você saiu da fila.')] }, { ephemeral: true }));
  }
  if (!i.guildId || !i.channel?.isSendable()) return replyError(i, 'Use este comando em um canal de texto do servidor.');
  const c = await findCharacter(i.user.id);
  if (!c) return replyError(i, 'Você ainda não tem personagem. Use /criar-personagem para começar.');
  if (!c.lineageId) return replyError(i, 'Você ainda não tem linhagem. Faça seu giro gratuito com /girar.');
  if (queuedUser.has(i.user.id)) return replyError(i, 'Você já está na fila. Use /fila sair para sair.');
  const busy = busyReason(i.user.id);
  if (busy) return replyError(i, busy);
  const mode = i.options.getString('modo', true) as MatchMode;
  const settings = await guildSettings(i.guildId);
  if (RARITY_COST[getLineage(c.lineageId).rarity] > settings.rarityBudget[mode]) return replyError(i, 'Sua linhagem sozinha passa do orçamento de raridade deste modo.');
  const rating = await getRating(prisma, c.id, rankGroupForMode(mode));
  const k = key(i.guildId, mode);
  const q = queues.get(k) ?? [];
  q.push({ userId: i.user.id, character: c, mmr: rating.mmr, channel: i.channel, since: Date.now() });
  queues.set(k, q);
  queuedUser.set(i.user.id, k);
  await i.reply(
    screen(
      { accent: 'padrao', blocks: [text(`### Fila ranqueada ${mode}\nMMR **${rating.mmr}**. ${q.length}/${Number(mode[0]) * 2} jogadores na fila deste modo.\n-# A busca começa com MMR próximo e abre aos poucos. Use /fila sair para desistir.`)] },
      { ephemeral: true },
    ),
  );
  void tryMatch(i.guildId, mode).catch((e) => console.error('[fila]', e));
});
