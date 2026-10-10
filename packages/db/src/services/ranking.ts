import { MMR, type RankGroup } from '@ego/content';
import { prisma, type Tx } from '../client';

/** Temporada ativa (cria a primeira se não existir). */
export async function activeSeason(tx: Tx = prisma) {
  const now = new Date();
  const s = await tx.season.findFirst({ where: { active: true }, orderBy: { startsAt: 'desc' } });
  if (s) return s;
  const count = await tx.season.count();
  return tx.season.create({
    data: { name: `Temporada ${count + 1}`, startsAt: now, endsAt: new Date(now.getTime() + 90 * 86400_000), active: true },
  });
}

export async function getRating(tx: Tx, characterId: string, group: RankGroup) {
  const season = await activeSeason(tx);
  return tx.rating.upsert({
    where: { characterId_seasonId_group: { characterId, seasonId: season.id, group } },
    create: { characterId, seasonId: season.id, group, mmr: MMR.start },
    update: {},
  });
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** Delta de Elo por time: média de MMR de cada lado. */
export function eloDelta(teamAvg: number, oppAvg: number, score: 0 | 0.5 | 1): number {
  return Math.round(MMR.kFactor * (score - expectedScore(teamAvg, oppAvg)));
}

export async function leaderboard(guildId: string, group: RankGroup, take = 25, skip = 0) {
  const season = await activeSeason();
  const rows = await prisma.rating.findMany({
    where: { seasonId: season.id, group, character: { guildId } },
    orderBy: [{ mmr: 'desc' }, { wins: 'desc' }, { updatedAt: 'asc' }],
    take,
    skip,
    include: { character: { select: { id: true, name: true, number: true, lineageId: true, titleId: true, frameId: true, discordId: true, tokenColor: true, level: true } } },
  });
  const total = await prisma.rating.count({ where: { seasonId: season.id, group, character: { guildId } } });
  return { season, total, rows: rows.map((r, i) => ({ position: skip + i + 1, ...r })) };
}

/** Posição do personagem no ranking do servidor (null se ainda não jogou ranqueada). */
export async function rankPosition(characterId: string, guildId: string, group: RankGroup) {
  const season = await activeSeason();
  const mine = await prisma.rating.findUnique({ where: { characterId_seasonId_group: { characterId, seasonId: season.id, group } } });
  if (!mine) return { position: null as number | null, mmr: MMR.start, total: 0, wins: 0, losses: 0, draws: 0 };
  const above = await prisma.rating.count({ where: { seasonId: season.id, group, character: { guildId }, mmr: { gt: mine.mmr } } });
  const total = await prisma.rating.count({ where: { seasonId: season.id, group, character: { guildId } } });
  return { position: above + 1, mmr: mine.mmr, total, wins: mine.wins, losses: mine.losses, draws: mine.draws };
}

/** Fecha a temporada: grava o snapshot final e abre a próxima. */
export async function closeSeason(seasonId: string) {
  return prisma.$transaction(async (tx) => {
    const season = await tx.season.findUniqueOrThrow({ where: { id: seasonId } });
    const ratings = await tx.rating.findMany({ where: { seasonId }, orderBy: { mmr: 'desc' }, include: { character: { select: { name: true, guildId: true } } } });
    const snapshot = ratings.map((r, i) => ({ position: i + 1, characterId: r.characterId, name: r.character.name, guildId: r.character.guildId, group: r.group, mmr: r.mmr, wins: r.wins, losses: r.losses }));
    await tx.season.update({ where: { id: seasonId }, data: { active: false, snapshot, endsAt: new Date() } });
    const count = await tx.season.count();
    const now = new Date();
    return tx.season.create({ data: { name: `Temporada ${count + 1}`, startsAt: now, endsAt: new Date(now.getTime() + (season.endsAt.getTime() - season.startsAt.getTime())), active: true } });
  });
}
