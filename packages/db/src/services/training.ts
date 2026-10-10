import { TRAINING_REWARDS, type Reward } from '@ego/content';
import { prisma } from '../client';
import { dayKey } from '../time';
import { trackMetrics, type MissionUpdate } from './missions';
import { grantReward, type AppliedReward } from './progression';

export type TrainingKind = 'drible' | 'desarme' | 'fisico' | '1v1';

export interface TrainingOutcome {
  kind: TrainingKind;
  /** drible/desarme: acertos em 5; fisico: rodadas poupadas; 1v1: gols e vitória. */
  hits?: number;
  roundsSaved?: number;
  finished?: boolean;
  goals?: number;
  won?: boolean;
  /** 1v1: jogadas de visão (leituras certas, passes). */
  reads?: number;
}

/** Recompensa do treino calculada só no servidor, a partir do resultado resolvido no servidor. */
export function trainingReward(o: TrainingOutcome): Reward {
  switch (o.kind) {
    case 'drible':
      return { xp: TRAINING_REWARDS.drible.xp, ienes: TRAINING_REWARDS.drible.ienes, tokens: { drible: (o.hits ?? 0) * TRAINING_REWARDS.drible.tokensPerHit } };
    case 'desarme':
      return { xp: TRAINING_REWARDS.desarme.xp, ienes: TRAINING_REWARDS.desarme.ienes, tokens: { defesa: (o.hits ?? 0) * TRAINING_REWARDS.desarme.tokensPerHit } };
    case 'fisico': {
      const R = TRAINING_REWARDS.fisico;
      const t = o.finished ? R.tokensBase + (o.roundsSaved ?? 0) * R.tokensBonusPerRoundSaved : Math.floor(R.tokensBase / 2);
      return { xp: R.xp, ienes: R.ienes, tokens: { velocidade: t, fisico: t } };
    }
    case '1v1': {
      const R = TRAINING_REWARDS['1v1'];
      return {
        xp: o.won ? R.xpWin : R.xpLoss,
        ienes: R.ienes,
        tokens: { chute: (o.goals ?? 0) * R.tokensPerGoal + 1, visao: R.visionTokensBase + (o.reads ?? 0) },
      };
    }
  }
}

export async function finishTraining(characterId: string, o: TrainingOutcome): Promise<{ reward: AppliedReward; missions: MissionUpdate }> {
  return prisma.$transaction(async (tx) => {
    const reward = await grantReward(tx, characterId, trainingReward(o));
    await tx.dailyCounter.upsert({
      where: { characterId_dayKey: { characterId, dayKey: dayKey() } },
      create: { characterId, dayKey: dayKey(), trainings: 1 },
      update: { trainings: { increment: 1 } },
    });
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    const missions = await trackMetrics(tx, characterId, { treino: 1, gol: o.kind === '1v1' ? (o.goals ?? 0) : 0 }, c.lineageId);
    await tx.character.update({ where: { id: characterId }, data: { lastActiveAt: new Date() } });
    return { reward, missions };
  });
}
