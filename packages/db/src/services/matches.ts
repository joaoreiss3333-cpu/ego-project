import {
  ANTI_ABUSE,
  COLORS,
  MARKET_VALUE,
  MATCH_REWARDS,
  RARITY_COST,
  getLineage,
  rankGroupForMode,
  type AttrKey,
  type Difficulty,
  type MatchMode,
  type MissionMetric,
  type Reward,
} from '@ego/content';
import type { MatchSetup, PlanMap, PlayerStats, SlotSetup, Team } from '@ego/engine';
import type { Character, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../client';
import { ERR } from '../errors';
import { dayKey } from '../time';
import { effectiveAttrs, lineageProgress } from './character';
import { checkStatUnlocks } from './items';
import { trackMetrics, type MissionUpdate } from './missions';
import { grantReward, type AppliedReward } from './progression';
import { eloDelta, getRating } from './ranking';
import { recordSelection, type SelectionOutcome } from './selection';

/** O que o fechamento da partida lê do estado (serve para o motor antigo e para o de turnos). */
export interface FinishableState {
  setup: MatchSetup;
  players: Record<string, { stats: PlayerStats }>;
  score: Record<Team, number>;
  winner: Team | 'draw' | null;
}

/** Monta o jogador da partida a partir do personagem (atributos com equipamento, árvore, loadout, maestria). */
export async function slotFromCharacter(
  c: Character,
  opts: { id: string; team: Team; isKeeper?: boolean; difficulty?: Difficulty },
): Promise<SlotSetup> {
  if (!c.lineageId) throw ERR.noLineage();
  const [items, lp, mastery] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { characterId: c.id } }),
    prisma.$transaction((tx) => lineageProgress(tx, c.id, c.lineageId!)),
    prisma.skillMastery.findMany({ where: { characterId: c.id } }),
  ]);
  return {
    id: opts.id,
    team: opts.team,
    isKeeper: !!opts.isKeeper,
    name: c.name,
    number: c.number,
    characterId: c.id,
    isBot: false,
    position: opts.isKeeper ? 'goleiro' : (c.position as SlotSetup['position']),
    lineageId: c.lineageId,
    level: c.level,
    attrs: effectiveAttrs(c, items),
    nodes: lp.nodes,
    loadout: { active: lp.loadoutActive, flow: lp.loadoutFlow },
    mastery: Object.fromEntries(mastery.map((m) => [m.skillId, m.uses])),
    personality: 'cauteloso',
    difficulty: opts.difficulty ?? 'regular',
    color: c.tokenColor || COLORS.teamA,
    frameId: c.frameId,
    trailId: c.trailId,
    titleId: c.titleId,
  };
}

export function rarityCostOf(lineageId: string): number {
  return RARITY_COST[getLineage(lineageId).rarity];
}

export async function createMatchRecord(data: {
  guildId: string;
  channelId?: string | null;
  mode: MatchMode;
  kind: MatchSetup['kind'];
  setup: MatchSetup;
  stageId?: string | null;
}) {
  return prisma.match.create({
    data: {
      id: data.setup.id,
      guildId: data.guildId,
      channelId: data.channelId ?? null,
      mode: data.mode,
      kind: data.kind,
      status: 'running',
      seed: data.setup.seed,
      stageId: data.stageId ?? null,
      setup: data.setup as unknown as Prisma.InputJsonValue,
      participants: {
        create: data.setup.slots.map((s) => ({ slotId: s.id, team: s.team, isKeeper: s.isKeeper, isBot: s.isBot, characterId: s.characterId })),
      },
    },
  });
}

/** Snapshot a cada lance: estado atual + entradas finais (para sobreviver a reinício e para replay). */
export async function saveSnapshot(matchId: string, state: object, turns: unknown[], messageId?: string | null) {
  await prisma.match.update({
    where: { id: matchId },
    data: {
      snapshot: state as unknown as Prisma.InputJsonValue,
      turns: turns as unknown as Prisma.InputJsonValue,
      ...(messageId ? { messageId } : {}),
    },
  });
}

export async function runningMatches() {
  return prisma.match.findMany({ where: { status: 'running' } });
}

export async function abortMatch(matchId: string, reason: string) {
  await prisma.match.update({ where: { id: matchId }, data: { status: 'aborted', finishedAt: new Date(), flagReason: reason } });
}

// ---------------------------------------------------------------------------
// Fechamento
// ---------------------------------------------------------------------------

export interface ParticipantResult {
  characterId: string;
  slotId: string;
  team: Team;
  won: boolean;
  draw: boolean;
  activeRatio: number;
  multiplier: number;
  multiplierReasons: string[];
  reward: AppliedReward | null;
  selection: SelectionOutcome | null;
  missions: MissionUpdate;
  mmrDelta: number | null;
  masteryGains: Record<string, number>;
  cosmeticsUnlocked: string[];
}

export interface FinalizeResult {
  matchId: string;
  winner: Team | 'draw' | null;
  score: Record<Team, number>;
  flagged: boolean;
  flagReason: string | null;
  countsForMmr: boolean;
  participants: ParticipantResult[];
}

/** Recompensa base da partida para um jogador (antes das travas). */
export function baseMatchReward(state: FinishableState, slotId: string, won: boolean, draw: boolean, ranked: boolean): Reward {
  const st = state.players[slotId].stats;
  const R = MATCH_REWARDS;
  let xp = st.activeTurns * R.perActiveTurn.xp + st.goals * R.goal.xp + st.assists * R.assist.xp + st.readsCorrect * R.readCorrect.xp + st.duelsWon * R.duelWon.xp + st.saves * R.save.xp;
  let ienes = st.activeTurns * R.perActiveTurn.ienes + st.goals * R.goal.ienes + st.assists * R.assist.ienes + st.readsCorrect * R.readCorrect.ienes + st.duelsWon * R.duelWon.ienes + st.saves * R.save.ienes;
  if (won) {
    xp += R.win.xp;
    ienes += R.win.ienes;
  } else if (draw) {
    xp += R.draw.xp;
    ienes += R.draw.ienes;
  }
  if (ranked) {
    xp *= R.rankedMultiplier;
    ienes *= R.rankedMultiplier;
  }
  const tokens: Partial<Record<AttrKey, number>> = {
    passe: Math.min(R.maxPassTokensPerMatch, st.passesCompleted * R.passTokensPerCompletedPass + st.assists * R.assist.passTokens),
  };
  // extra: drible e defesa rendem fichas pequenas nas partidas
  if (st.dribblesWon >= 2) tokens.drible = Math.floor(st.dribblesWon / 2);
  if (st.tackles >= 2) tokens.defesa = Math.floor(st.tackles / 2);
  return { xp: Math.round(xp), ienes: Math.round(ienes), tokens };
}

function metricsOf(state: FinishableState, slotId: string, won: boolean, kind: string): Partial<Record<MissionMetric, number>> {
  const st = state.players[slotId].stats;
  return {
    gol: st.goals,
    gol_de_primeira: st.goalsOneTouch,
    assistencia: st.assists,
    leitura_certa: st.readsCorrect,
    drible_vencido: st.dribblesWon,
    desarme: st.tackles,
    defesa_goleiro: st.saves,
    passe_certo: st.passesCompleted,
    habilidade_usada: Object.values(st.skillUses).reduce((a, b) => a + b, 0),
    partida_jogada: 1,
    vitoria_partida: won && (kind === 'casual' || kind === 'ranqueada') ? 1 : 0,
    vitoria_selecao: won && kind === 'selecao' ? 1 : 0,
  };
}

/**
 * Fecha uma partida: aplica recompensas com as travas, MMR (ranqueada),
 * maestria, estatísticas, missões e valor de mercado. Tudo no servidor.
 */
export async function finalizeMatch(matchId: string, state: FinishableState, turns: unknown[]): Promise<FinalizeResult> {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { participants: true } });
  if (match.status === 'finished') throw ERR.invalid('Essa partida já foi encerrada.');
  const setup = state.setup;
  const kind = setup.kind;
  const ranked = kind === 'ranqueada';
  const humans = setup.slots.filter((s) => s.characterId);
  const winner = state.winner;

  // entregar o jogo: um lado sem nenhuma ação própria
  let flagged = false;
  let flagReason: string | null = null;
  for (const team of ['A', 'B'] as Team[]) {
    const side = humans.filter((s) => s.team === team);
    if (side.length && side.every((s) => state.players[s.id].stats.activeTurns === 0)) {
      flagged = true;
      flagReason = `Time ${team} terminou sem nenhuma ação própria`;
    }
  }
  const countsForMmr = ranked && !flagged;

  // grupo repetido nos últimos 60 min
  const groupKey = humans
    .map((s) => s.characterId)
    .sort()
    .join('|');
  const since = new Date(Date.now() - ANTI_ABUSE.repeatWindowMinutes * 60_000);
  const recent = await prisma.match.findMany({
    where: { status: 'finished', finishedAt: { gte: since }, kind: { in: ['casual', 'ranqueada'] } },
    include: { participants: true },
  });
  const sameGroup = recent.filter(
    (m) =>
      m.participants
        .filter((p) => p.characterId)
        .map((p) => p.characterId!)
        .sort()
        .join('|') === groupKey,
  ).length;

  // Elo por time
  const group = rankGroupForMode(setup.mode);
  const mmrBefore: Record<string, number> = {};
  if (countsForMmr) {
    for (const s of humans) mmrBefore[s.characterId!] = (await getRating(prisma, s.characterId!, group)).mmr;
  }
  const avg = (team: Team) => {
    const xs = humans.filter((s) => s.team === team).map((s) => mmrBefore[s.characterId!]);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1000;
  };

  const results: ParticipantResult[] = [];
  const today = dayKey();
  await prisma.$transaction(
    async (tx) => {
      for (const s of humans) {
        const cid = s.characterId!;
        const p = state.players[s.id];
        const won = winner === s.team;
        const draw = winner === 'draw';
        const ratio = p.stats.totalTurns ? p.stats.activeTurns / p.stats.totalTurns : 0;
        const reasons: string[] = [];
        let mult = 1;
        if (ratio < ANTI_ABUSE.minActiveRatio) {
          mult *= ANTI_ABUSE.lowActivityMultiplier;
          reasons.push(`Menos de ${Math.round(ANTI_ABUSE.minActiveRatio * 100)}% dos lances com ação própria`);
        }
        const counter = await tx.dailyCounter.upsert({
          where: { characterId_dayKey: { characterId: cid, dayKey: today } },
          create: { characterId: cid, dayKey: today, matches: 1 },
          update: { matches: { increment: 1 } },
        });
        if (kind === 'casual' || kind === 'ranqueada') {
          const tier = ANTI_ABUSE.dailyTiers.find((t) => counter.matches <= t.upTo)!;
          if (tier.multiplier < 1) {
            mult *= tier.multiplier;
            reasons.push(`Partida ${counter.matches} do dia (retorno decrescente)`);
          }
          if (humans.length > 1 && sameGroup + 1 >= ANTI_ABUSE.repeatFrom) {
            mult *= ANTI_ABUSE.repeatMultiplier;
            reasons.push('Mesmo grupo de jogadores repetido em menos de 1 hora');
          }
        }

        let reward: AppliedReward | null = null;
        let selection: SelectionOutcome | null = null;
        if (kind === 'selecao' && match.stageId) {
          selection = await recordSelection(tx, cid, match.stageId, won);
        } else if (kind === 'casual' || kind === 'ranqueada') {
          reward = await grantReward(tx, cid, baseMatchReward(state, s.id, won, draw, ranked), mult);
        }

        // maestria
        const masteryGains: Record<string, number> = {};
        for (const [skillId, uses] of Object.entries(p.stats.skillUses)) {
          if (!uses) continue;
          masteryGains[skillId] = uses;
          await tx.skillMastery.upsert({
            where: { characterId_skillId: { characterId: cid, skillId } },
            create: { characterId: cid, skillId, uses },
            update: { uses: { increment: uses } },
          });
        }

        // estatísticas e valor de mercado
        const mv = p.stats.goals * MARKET_VALUE.goal + p.stats.assists * MARKET_VALUE.assist + (won ? MARKET_VALUE.win : 0);
        const updated = await tx.character.update({
          where: { id: cid },
          data: {
            goals: { increment: p.stats.goals },
            assists: { increment: p.stats.assists },
            matches: { increment: 1 },
            wins: { increment: won ? 1 : 0 },
            dribblesWon: { increment: p.stats.dribblesWon },
            readsCorrect: { increment: p.stats.readsCorrect },
            saves: { increment: p.stats.saves },
            tackles: { increment: p.stats.tackles },
            marketValue: { increment: Math.round(mv * Math.min(1, mult + 0.2)) },
            lastActiveAt: new Date(),
          },
        });
        const cosmeticsUnlocked = await checkStatUnlocks(tx, updated);

        // MMR
        let mmrDelta: number | null = null;
        if (countsForMmr) {
          const other: Team = s.team === 'A' ? 'B' : 'A';
          const sc: 0 | 0.5 | 1 = won ? 1 : draw ? 0.5 : 0;
          mmrDelta = eloDelta(avg(s.team), avg(other), sc);
          const r = await getRating(tx, cid, group);
          await tx.rating.update({
            where: { id: r.id },
            data: { mmr: Math.max(0, r.mmr + mmrDelta), wins: { increment: won ? 1 : 0 }, losses: { increment: !won && !draw ? 1 : 0 }, draws: { increment: draw ? 1 : 0 } },
          });
        }

        const missions = await trackMetrics(tx, cid, metricsOf(state, s.id, won, kind), updated.lineageId);

        await tx.matchParticipant.updateMany({
          where: { matchId, slotId: s.id },
          data: {
            activeTurns: p.stats.activeTurns,
            totalTurns: p.stats.totalTurns,
            stats: p.stats as unknown as Prisma.InputJsonValue,
            rewards: { reward, selection, multiplier: mult, reasons } as unknown as Prisma.InputJsonValue,
            mmrDelta,
          },
        });
        results.push({
          characterId: cid,
          slotId: s.id,
          team: s.team,
          won,
          draw,
          activeRatio: ratio,
          multiplier: mult,
          multiplierReasons: reasons,
          reward,
          selection,
          missions,
          mmrDelta,
          masteryGains,
          cosmeticsUnlocked,
        });
      }
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'finished',
          finishedAt: new Date(),
          snapshot: state as unknown as Prisma.InputJsonValue,
          turns: turns as unknown as Prisma.InputJsonValue,
          result: { winner, score: state.score, countsForMmr } as unknown as Prisma.InputJsonValue,
          flagged,
          flagReason,
        },
      });
    },
    { timeout: 30_000 },
  );
  return { matchId, winner, score: state.score, flagged, flagReason, countsForMmr, participants: results };
}

export async function matchHistory(characterId: string, take = 20) {
  return prisma.matchParticipant.findMany({
    where: { characterId, match: { status: 'finished' } },
    orderBy: { match: { finishedAt: 'desc' } },
    take,
    include: { match: true },
  });
}

export async function matchForReplay(matchId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { participants: true } });
  if (!m || m.status !== 'finished') return null;
  return { match: m, setup: m.setup as unknown as MatchSetup, turns: m.turns as unknown as PlanMap[] };
}

/** Valor de mercado exibido: cai devagar com inatividade (só exibição). */
export function marketValueNow(c: Pick<Character, 'marketValue' | 'lastActiveAt'>, now = Date.now()): number {
  const days = (now - c.lastActiveAt.getTime()) / 86400_000 - MARKET_VALUE.inactivityGraceDays;
  if (days <= 0) return c.marketValue;
  return Math.max(MARKET_VALUE.floor, Math.round(c.marketValue * Math.pow(1 - MARKET_VALUE.inactivityDecayPerDay, days)));
}

export type { Tx };
