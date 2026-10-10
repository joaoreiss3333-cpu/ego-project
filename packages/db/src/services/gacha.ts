import { randomBytes } from 'node:crypto';
import { GACHA, LINEAGES, RARITIES, type Rarity } from '@ego/content';
import { Rng } from '@ego/engine';
import { prisma } from '../client';
import { ERR, GameError } from '../errors';
import { lineageProgress } from './character';

export interface SpinResult {
  logId: string;
  rarity: Rarity;
  lineageId: string;
  isNew: boolean;
  forcedBy: 'lendaria' | 'mitica' | null;
  pityLegendary: number;
  pityMythic: number;
  /** Sem linhagem: o primeiro resultado é aceito direto. */
  autoAccepted: boolean;
  free: boolean;
}

/** Sorteio puro (testável): dado o roll e os contadores, qual raridade sai. */
export function rollRarity(roll: number, pityLegendary: number, pityMythic: number, pickRoll: number): { rarity: Rarity; forcedBy: 'lendaria' | 'mitica' | null } {
  if (pityMythic + 1 >= GACHA.pityMythic) return { rarity: 'mitica', forcedBy: 'mitica' };
  if (pityLegendary + 1 >= GACHA.pityLegendary) {
    // Lendária ou melhor, na proporção das chances
    const pM = GACHA.rates.mitica / (GACHA.rates.mitica + GACHA.rates.lendaria);
    return { rarity: pickRoll < pM ? 'mitica' : 'lendaria', forcedBy: 'lendaria' };
  }
  let acc = 0;
  for (const r of RARITIES) {
    acc += GACHA.rates[r];
    if (roll < acc) return { rarity: r, forcedBy: null };
  }
  return { rarity: 'comum', forcedBy: null };
}

function lineageFor(rarity: Rarity, roll: number): string {
  // se a raridade não tiver linhagem no conteúdo, cai para a mais próxima abaixo
  let idx = RARITIES.indexOf(rarity);
  while (idx >= 0) {
    const pool = LINEAGES.filter((l) => l.rarity === RARITIES[idx]);
    if (pool.length) return pool[Math.floor(roll * pool.length)].id;
    idx--;
  }
  return LINEAGES[0].id;
}

export async function spin(characterId: string): Promise<SpinResult> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const pending = await tx.gachaLog.findFirst({ where: { characterId, decision: null } });
    if (pending) throw new GameError('pending_spin', 'Você tem um resultado de giro esperando decisão. Aceite ou descarte antes de girar de novo.');
    const free = c.freeSpin;
    if (!free && c.coins < GACHA.cost) throw ERR.notEnough(`Blue Lock Coins (custa ${GACHA.cost})`);
    const seed = randomBytes(16).toString('hex');
    const rng = new Rng(seed);
    const roll = rng.next();
    const { rarity, forcedBy } = rollRarity(roll, c.pityLegendary, c.pityMythic, rng.next());
    const lineageId = lineageFor(rarity, rng.next());
    const isLegendaryPlus = rarity === 'lendaria' || rarity === 'mitica';
    const upd = await tx.character.updateMany({
      where: { id: characterId, ...(free ? { freeSpin: true } : { coins: { gte: GACHA.cost } }) },
      data: {
        ...(free ? { freeSpin: false } : { coins: { decrement: GACHA.cost } }),
        pityLegendary: isLegendaryPlus ? 0 : c.pityLegendary + 1,
        pityMythic: rarity === 'mitica' ? 0 : c.pityMythic + 1,
      },
    });
    if (upd.count !== 1) throw new GameError('retry', 'Tente de novo em alguns segundos.');
    const owned = await tx.lineageProgress.findUnique({ where: { characterId_lineageId: { characterId, lineageId } } });
    const autoAccepted = !c.lineageId;
    const log = await tx.gachaLog.create({
      data: {
        characterId,
        seed,
        roll,
        rarity,
        lineageId,
        pityLegendaryBefore: c.pityLegendary,
        pityMythicBefore: c.pityMythic,
        forcedBy,
        rates: { ...GACHA.rates, pityLegendary: GACHA.pityLegendary, pityMythic: GACHA.pityMythic },
        cost: free ? 0 : GACHA.cost,
        free,
        decision: autoAccepted ? 'aceito' : null,
        decidedAt: autoAccepted ? new Date() : null,
      },
    });
    if (autoAccepted) {
      await lineageProgress(tx, characterId, lineageId);
      await tx.character.update({ where: { id: characterId }, data: { lineageId } });
    }
    return {
      logId: log.id,
      rarity,
      lineageId,
      isNew: !owned,
      forcedBy,
      pityLegendary: isLegendaryPlus ? 0 : c.pityLegendary + 1,
      pityMythic: rarity === 'mitica' ? 0 : c.pityMythic + 1,
      autoAccepted,
      free,
    };
  });
}

/** Aceitar troca a linhagem equipada; a árvore de cada linhagem fica salva. */
export async function decideSpin(characterId: string, logId: string, accept: boolean) {
  return prisma.$transaction(async (tx) => {
    const log = await tx.gachaLog.findUnique({ where: { id: logId } });
    if (!log || log.characterId !== characterId) throw ERR.invalid('Giro não encontrado.');
    if (log.decision) throw ERR.invalid('Esse giro já foi decidido.');
    await tx.gachaLog.update({ where: { id: logId }, data: { decision: accept ? 'aceito' : 'descartado', decidedAt: new Date() } });
    if (accept) {
      await lineageProgress(tx, characterId, log.lineageId);
      await tx.character.update({ where: { id: characterId }, data: { lineageId: log.lineageId } });
    }
    return { accepted: accept, lineageId: log.lineageId };
  });
}

export async function pendingSpin(characterId: string) {
  return prisma.gachaLog.findFirst({ where: { characterId, decision: null }, orderBy: { createdAt: 'desc' } });
}

export async function spinHistory(characterId: string, take = 20) {
  return prisma.gachaLog.findMany({ where: { characterId }, orderBy: { createdAt: 'desc' }, take });
}
