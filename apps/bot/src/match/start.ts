import { randomBytes } from 'node:crypto';
import type { SendableChannels } from 'discord.js';
import { LINEAGES, type BotSpec, type Difficulty, type MatchMode, type Personality, type Position } from '@ego/content';
import { botSlot, buildSetup, keeperSlot, turnos, type MatchSetup, type SlotSetup, type Team } from '@ego/engine';
import { abortMatch, prisma, slotFromCharacter, type Character } from '@ego/db';
import { finishRegular, finishTraining1v1 } from './finish';
import { MatchSession, type Participant, type TurnLog } from './session';

export interface Seat {
  userId: string;
  character: Character;
}

export interface StartInput {
  guildId: string;
  channel: SendableChannels;
  mode: MatchMode;
  kind: 'casual' | 'ranqueada' | 'selecao' | 'treino';
  teamA: Seat[];
  teamB: Seat[];
  keeperA?: Seat | null;
  keeperB?: Seat | null;
  /** Bots do time B (Modo Seleção e treino). */
  botsB?: BotSpec[];
  botDifficultyB?: Difficulty;
  stageId?: string | null;
  quick?: boolean;
  /** `turnsPerHalf` conta rodadas (todo mundo joga uma vez por rodada). */
  rules?: { turnsPerHalf: number; halves: number; firstTo?: number | null };
  label: string;
}

const PERSONALITIES: Personality[] = ['egoista', 'coletivo', 'agressivo', 'cauteloso'];
const POSITIONS: Position[] = ['atacante', 'meio', 'defensor'];

function rand<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

export function newMatchId(): string {
  return `m${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}

export async function startMatch(input: StartInput): Promise<MatchSession> {
  const n = Number(input.mode[0]);
  const humans = [...input.teamA, ...input.teamB, ...(input.keeperA ? [input.keeperA] : []), ...(input.keeperB ? [input.keeperB] : [])];
  const avgLevel = humans.length ? humans.reduce((a, s) => a + s.character.level, 0) / humans.length : 5;
  const slots: SlotSetup[] = [];
  const participants: Participant[] = [];
  for (const team of ['A', 'B'] as Team[]) {
    const seats = team === 'A' ? input.teamA : input.teamB;
    for (let i = 0; i < n; i++) {
      const id = `${team}${i + 1}`;
      const seat = seats[i];
      if (seat) {
        slots.push(await slotFromCharacter(seat.character, { id, team }));
        participants.push({ userId: seat.userId, characterId: seat.character.id, slotId: id });
      } else if (team === 'B' && input.botsB?.[i]) {
        slots.push(botSlot(input.botsB[i], id, team, input.botDifficultyB ?? 'regular'));
      } else {
        const l = rand(LINEAGES.filter((x) => x.rarity === 'comum' || x.rarity === 'rara'));
        slots.push(
          botSlot(
            { name: `Candidato ${100 + Math.floor(Math.random() * 899)}`, lineageId: l.id, level: Math.max(1, Math.round(avgLevel)), personality: rand(PERSONALITIES), position: rand(POSITIONS) },
            id,
            team,
            input.kind === 'selecao' && team === 'A' ? 'regular' : (input.botDifficultyB ?? 'regular'),
          ),
        );
      }
    }
    const gk = team === 'A' ? input.keeperA : input.keeperB;
    const gkId = `${team}GK`;
    if (gk) {
      slots.push(await slotFromCharacter(gk.character, { id: gkId, team, isKeeper: true }));
      participants.push({ userId: gk.userId, characterId: gk.character.id, slotId: gkId });
    } else {
      const diff: Difficulty = input.kind === 'selecao' && team === 'B' ? (input.botDifficultyB ?? 'regular') : 'regular';
      slots.push(keeperSlot(gkId, team, avgLevel, diff));
    }
  }
  const quick = !!input.quick;
  const setup: MatchSetup = buildSetup({
    id: newMatchId(),
    seed: randomBytes(16).toString('hex'),
    mode: input.mode,
    kind: input.kind,
    slots,
    turnsPerHalf: input.rules?.turnsPerHalf ?? (quick ? 10 : turnos.TURNOS.roundsPerHalf),
    halves: input.rules?.halves ?? turnos.TURNOS.halves,
    firstTo: input.rules ? (input.rules.firstTo ?? null) : quick ? 3 : null,
  });
  const session = new MatchSession({
    guildId: input.guildId,
    channel: input.channel,
    setup,
    participants,
    stageId: input.stageId ?? null,
    label: input.label,
    onFinish: input.kind === 'treino' ? finishTraining1v1 : finishRegular,
  });
  await session.start(turnos.createTurnos(setup), true);
  return session;
}

/**
 * Retoma partidas em andamento depois de um reinício. Partidas das regras
 * antigas (outro formato de estado) não dá para continuar: são encerradas sem recompensa.
 */
export async function resumeMatch(channel: SendableChannels, row: { id: string; guildId: string; kind: string; stageId: string | null; setup: unknown; snapshot: unknown; turns: unknown }) {
  const snap = row.snapshot as turnos.TState | null;
  if (!snap || snap.engine !== 'turnos') {
    await abortMatch(row.id, 'partida das regras antigas: encerrada na atualização do jogo');
    return null;
  }
  const setup = row.setup as MatchSetup;
  const turns = (row.turns as TurnLog[]) ?? [];
  const charIds = setup.slots.map((s) => s.characterId).filter(Boolean) as string[];
  const chars = await prisma.character.findMany({ where: { id: { in: charIds } } });
  const participants: Participant[] = setup.slots
    .filter((s) => s.characterId)
    .map((s) => ({ userId: chars.find((c) => c.id === s.characterId)?.discordId ?? '', characterId: s.characterId!, slotId: s.id }))
    .filter((p) => p.userId);
  const session = new MatchSession({
    guildId: row.guildId,
    channel,
    setup,
    participants,
    stageId: row.stageId,
    label: `${setup.mode} · retomada`,
    resume: { state: snap, turns },
    onFinish: row.kind === 'treino' ? finishTraining1v1 : finishRegular,
  });
  await session.start(snap, false);
  return session;
}
