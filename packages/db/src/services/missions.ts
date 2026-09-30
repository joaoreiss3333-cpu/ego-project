import {
  AWAKENING_MISSIONS,
  DAILY_MISSIONS,
  MISSION_COIN_BONUS,
  WEEKLY_MISSIONS,
  getMission,
  type MissionDef,
  type MissionMetric,
} from '@ego/content';
import { Rng } from '@ego/engine';
import { prisma, type Tx } from '../client';
import { dayKey, weekKey } from '../time';
import { grantReward, type AppliedReward } from './progression';

const BONUS_PREFIX = 'bonus:';
const BONUS_DAILY = 'bonus:daily';
const BONUS_WEEKLY = 'bonus:weekly';

function pickN(pool: MissionDef[], n: number, seed: string): MissionDef[] {
  const rng = new Rng(seed);
  const arr = [...pool];
  const out: MissionDef[] = [];
  while (out.length < n && arr.length) out.push(arr.splice(Math.floor(rng.next() * arr.length), 1)[0]);
  return out;
}

export function periodKeys(now = new Date()) {
  return { daily: `d:${dayKey(now)}`, weekly: `w:${weekKey(now)}` };
}

/** Garante as 3 diárias e 3 semanais do período (sorteio determinístico por personagem). */
export async function ensureMissions(tx: Tx, characterId: string, now = new Date()) {
  const { daily, weekly } = periodKeys(now);
  for (const [key, pool, count] of [
    [daily, DAILY_MISSIONS, MISSION_COIN_BONUS.dailyCount],
    [weekly, WEEKLY_MISSIONS, MISSION_COIN_BONUS.weeklyCount],
  ] as [string, MissionDef[], number][]) {
    const existing = await tx.missionProgress.count({ where: { characterId, periodKey: key, missionId: { not: { startsWith: BONUS_PREFIX } } } });
    if (existing >= count) continue;
    for (const m of pickN(pool, count, `${characterId}:${key}`)) {
      await tx.missionProgress.upsert({
        where: { characterId_missionId_periodKey: { characterId, missionId: m.id, periodKey: key } },
        create: { characterId, missionId: m.id, periodKey: key, target: m.target },
        update: {},
      });
    }
  }
  for (const m of AWAKENING_MISSIONS) {
    await tx.missionProgress.upsert({
      where: { characterId_missionId_periodKey: { characterId, missionId: m.id, periodKey: 'awakening' } },
      create: { characterId, missionId: m.id, periodKey: 'awakening', target: m.target },
      update: {},
    });
  }
}

export interface MissionUpdate {
  completed: { mission: MissionDef; reward: AppliedReward }[];
  bonus: { kind: 'daily' | 'weekly'; coins: number }[];
}

/**
 * Soma progresso nas missões ativas. `lineageId` é a linhagem equipada no momento
 * (missões de Despertar só contam com ela).
 */
export async function trackMetrics(tx: Tx, characterId: string, metrics: Partial<Record<MissionMetric, number>>, lineageId: string | null, now = new Date()): Promise<MissionUpdate> {
  await ensureMissions(tx, characterId, now);
  const { daily, weekly } = periodKeys(now);
  const rows = await tx.missionProgress.findMany({ where: { characterId, periodKey: { in: [daily, weekly, 'awakening'] }, completed: false } });
  const out: MissionUpdate = { completed: [], bonus: [] };
  for (const r of rows) {
    if (r.missionId.startsWith(BONUS_PREFIX)) continue;
    const def = getMission(r.missionId);
    if (def.lineageId && def.lineageId !== lineageId) continue;
    const add = metrics[def.metric] ?? 0;
    if (add <= 0) continue;
    const progress = Math.min(r.target, r.progress + add);
    const completed = progress >= r.target;
    await tx.missionProgress.update({ where: { id: r.id }, data: { progress, completed, completedAt: completed ? now : null } });
    if (completed) out.completed.push({ mission: def, reward: await grantReward(tx, characterId, def.reward) });
  }
  // bônus de coins por fechar as 3 do período
  for (const [key, bonusId, coins, kind] of [
    [daily, BONUS_DAILY, MISSION_COIN_BONUS.allDaily, 'daily'],
    [weekly, BONUS_WEEKLY, MISSION_COIN_BONUS.allWeekly, 'weekly'],
  ] as [string, string, number, 'daily' | 'weekly'][]) {
    const done = await tx.missionProgress.count({ where: { characterId, periodKey: key, completed: true, missionId: { not: { startsWith: BONUS_PREFIX } } } });
    if (done < (kind === 'daily' ? MISSION_COIN_BONUS.dailyCount : MISSION_COIN_BONUS.weeklyCount)) continue;
    const already = await tx.missionProgress.findUnique({ where: { characterId_missionId_periodKey: { characterId, missionId: bonusId, periodKey: key } } });
    if (already) continue;
    await tx.missionProgress.create({ data: { characterId, missionId: bonusId, periodKey: key, target: 1, progress: 1, completed: true, completedAt: now } });
    await grantReward(tx, characterId, { coins });
    out.bonus.push({ kind, coins });
  }
  return out;
}

export interface MissionView {
  id: string;
  name: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  reward: MissionDef['reward'];
  lineageId?: string;
}

export async function missionBoard(characterId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await ensureMissions(tx, characterId, now);
    const { daily, weekly } = periodKeys(now);
    const rows = await tx.missionProgress.findMany({ where: { characterId, periodKey: { in: [daily, weekly, 'awakening'] } } });
    const view = (key: string): MissionView[] =>
      rows
        .filter((r) => r.periodKey === key && !r.missionId.startsWith(BONUS_PREFIX))
        .map((r) => {
          const d = getMission(r.missionId);
          return { id: d.id, name: d.name, description: d.description, progress: r.progress, target: r.target, completed: r.completed, reward: d.reward, lineageId: d.lineageId };
        });
    return {
      daily: view(daily),
      weekly: view(weekly),
      awakening: view('awakening'),
      dailyBonusClaimed: rows.some((r) => r.missionId === BONUS_DAILY && r.periodKey === daily),
      weeklyBonusClaimed: rows.some((r) => r.missionId === BONUS_WEEKLY && r.periodKey === weekly),
      bonus: MISSION_COIN_BONUS,
    };
  });
}
