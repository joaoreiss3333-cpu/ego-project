'use server';

import { revalidatePath } from 'next/cache';
import { SITE_PATHS, getLineage, type Rarity } from '@ego/content';
import { decideSpin, spin, spinHistory } from '@ego/db';
import type { ActionState } from '@/lib/action-state';
import { done, withCharacter } from '@/lib/run';

export interface SpinReveal {
  logId: string;
  rarity: Rarity;
  lineageId: string;
  lineageName: string;
  tagline: string;
  roll: number;
  isNew: boolean;
  forcedBy: 'lendaria' | 'mitica' | null;
  autoAccepted: boolean;
  free: boolean;
  pityLegendary: number;
  pityMythic: number;
}

/** O sorteio acontece só no servidor (services/gacha). O site apenas mostra o resultado auditável. */
export async function spinAction(_prev: ActionState<SpinReveal>): Promise<ActionState<SpinReveal>> {
  return withCharacter(async (c) => {
    const r = await spin(c.id);
    const [log] = await spinHistory(c.id, 1);
    const l = getLineage(r.lineageId);
    revalidatePath(SITE_PATHS.giro);
    return done<SpinReveal>('Avaliação concluída.', {
      logId: r.logId,
      rarity: r.rarity,
      lineageId: r.lineageId,
      lineageName: l.name,
      tagline: l.tagline,
      roll: log && log.id === r.logId ? log.roll : 0,
      isNew: r.isNew,
      forcedBy: r.forcedBy,
      autoAccepted: r.autoAccepted,
      free: r.free,
      pityLegendary: r.pityLegendary,
      pityMythic: r.pityMythic,
    });
  });
}

export async function decideSpinAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const logId = String(fd.get('logId') ?? '');
    const accept = fd.get('decision') === 'aceitar';
    const r = await decideSpin(c.id, logId, accept);
    revalidatePath(SITE_PATHS.giro);
    revalidatePath(SITE_PATHS.linhagem);
    const name = getLineage(r.lineageId).name;
    return done(accept ? `${name} equipada. A árvore dela está na aba Linhagem.` : `${name} descartada. Sua linhagem continua a mesma.`);
  });
}
