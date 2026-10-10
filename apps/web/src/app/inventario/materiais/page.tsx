import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ATTRS,
  ATTR_LABEL,
  ATTR_SHORT,
  ENERGY,
  GACHA,
  GAME,
  MATCH_REWARDS,
  MISSION_COIN_BONUS,
  PROGRESSION,
  SITE_PATHS,
  TRAINING_REWARDS,
  type AttrKey,
} from '@ego/content';
import { currentEnergy, tokensOf } from '@ego/db';
import { NoCharacter, PageHead, Panel } from '@/components/ui';
import { DRIBBLES_PER_TOKEN, TACKLES_PER_TOKEN } from '@/guides/data';
import { fmt, fmtDuration } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Materiais' };

/** De onde vem cada ficha (números do conteúdo). */
const SOURCES: Record<AttrKey, string> = {
  velocidade: `Treino físico: ${TRAINING_REWARDS.fisico.tokensBase} base, +${TRAINING_REWARDS.fisico.tokensBonusPerRoundSaved} por rodada poupada.`,
  drible: `Treino de drible: ${TRAINING_REWARDS.drible.tokensPerHit} por acerto. Partidas: 1 a cada ${DRIBBLES_PER_TOKEN} dribles.`,
  passe: `Partidas: ${MATCH_REWARDS.passTokensPerCompletedPass} por passe certo e ${MATCH_REWARDS.assist.passTokens} por assistência (até ${MATCH_REWARDS.maxPassTokensPerMatch}).`,
  chute: `Treino 1v1: ${TRAINING_REWARDS['1v1'].tokensPerGoal} por gol, +1 por treino.`,
  fisico: `Treino físico: mesmas fichas de Velocidade.`,
  visao: `Treino 1v1: ${TRAINING_REWARDS['1v1'].visionTokensBase} base, +1 por jogada de visão.`,
  defesa: `Treino de desarme: ${TRAINING_REWARDS.desarme.tokensPerHit} por acerto. Partidas: 1 a cada ${TACKLES_PER_TOKEN} desarmes.`,
};

export default async function MateriaisPage() {
  const v = await requireViewer(SITE_PATHS.materiais);
  if (!v.character) return <NoCharacter />;
  const c = v.character;
  const tok = tokensOf(c);
  const energy = currentEnergy(c);
  const totalTokens = ATTRS.reduce((a, k) => a + tok[k], 0);

  return (
    <>
      <PageHead
        code="03.3"
        section="Inventário"
        title="Materiais"
        lede={`Fichas de Treino sobem atributos acima de ${PROGRESSION.freeUpTo}. ${GAME.commonCurrency.plural} pagam melhorias e resets. ${GAME.premiumCurrency.plural} pagam o giro.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Fichas no total</span>
            <span className="big big--md">{fmt(totalTokens)}</span>
          </div>
        }
      />

      <div className="tokens">
        {ATTRS.map((k) => (
          <div key={k} className="token-cell">
            <span className="token-cell__k">{ATTR_SHORT[k]}</span>
            <span className="token-cell__v">{fmt(tok[k])}</span>
            <span className="token-cell__l">Fichas de {ATTR_LABEL[k]}</span>
            <span className="token-cell__src">{SOURCES[k]}</span>
          </div>
        ))}
      </div>

      <div className="split-3" style={{ marginTop: 20 }}>
        <Panel title={GAME.commonCurrency.plural} code="MOEDA COMUM">
          <span className="big big--md">{fmt(c.ienes)}</span>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 14 }}>
            Partidas, treinos, missões e o Modo Seleção. Vitória vale {MATCH_REWARDS.win.ienes}, cada gol {MATCH_REWARDS.goal.ienes}.
          </p>
        </Panel>
        <Panel title={GAME.premiumCurrency.plural} code={GAME.premiumCurrency.short}>
          <span className="big big--md">{fmt(c.coins)}</span>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 14 }}>
            Só de missões ({MISSION_COIN_BONUS.allDaily} por fechar as {MISSION_COIN_BONUS.dailyCount} diárias, {MISSION_COIN_BONUS.allWeekly} pelas {MISSION_COIN_BONUS.weeklyCount} semanais) e de chefes do Modo Seleção. Um giro custa {GACHA.cost}.
          </p>
          <Link href={SITE_PATHS.giro} className="label accent">
            Ir para o giro
          </Link>
        </Panel>
        <Panel title="Energia de treino" code={`+1 A CADA ${ENERGY.regenHours}H`}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <span className="big big--md">{energy.energy}</span>
            <span className="t-mono muted">/ {energy.max}</span>
          </div>
          <div className="energy" aria-hidden>
            {Array.from({ length: energy.max }, (_, i) => (
              <i key={i} className={i < energy.energy ? 'is-on' : ''} />
            ))}
          </div>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 14 }}>
            Cada treino gasta {ENERGY.trainingCost}. {energy.energy < energy.max ? `Próxima recarga em ${fmtDuration(energy.nextInMs)}.` : 'Energia cheia: treine antes que a recarga pare de contar.'}
          </p>
        </Panel>
      </div>

      <div className="split" style={{ marginTop: 16 }}>
        <Panel title="Pontos de Atributo" code={`+${PROGRESSION.attributePointsPerLevel} POR NÍVEL`}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span className="big big--md">{c.attrPoints}</span>
            <Link href={SITE_PATHS.atributos} className="btn btn--ghost btn--sm">
              Distribuir
            </Link>
          </div>
        </Panel>
        <Panel title="Pontos de Linhagem" code={`1 A CADA ${PROGRESSION.lineagePointEvery} NÍVEIS`}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span className="big big--md">{c.lineagePoints}</span>
            <Link href={SITE_PATHS.linhagem} className="btn btn--ghost btn--sm">
              Árvore
            </Link>
          </div>
          <span className="label">{c.level >= PROGRESSION.maxLevel ? 'Nível máximo' : `Próximo no nível ${c.level + (PROGRESSION.lineagePointEvery - (c.level % PROGRESSION.lineagePointEvery))}`}</span>
        </Panel>
      </div>
    </>
  );
}
