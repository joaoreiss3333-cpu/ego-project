import type { Metadata } from 'next';
import {
  DIFFICULTY_LABEL,
  PERSONALITY_LABEL,
  POSITION_LABEL,
  RARITY_COLORS,
  SITE_PATHS,
  findCosmetic,
  getEquipment,
  getLineage,
} from '@ego/content';
import { selectionStatus } from '@ego/db';
import { NoCharacter, PageHead, Tag } from '@/components/ui';
import { pct } from '@/lib/format';
import { rewardText } from '@/lib/rewards';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Modo Seleção' };

export default async function SelecaoPage() {
  const v = await requireViewer(SITE_PATHS.selecao);
  if (!v.character) return <NoCharacter />;
  const groups = await selectionStatus(v.character.id);
  const all = groups.flatMap((g) => g.stages);
  const cleared = all.filter((s) => s.cleared).length;

  return (
    <>
      <PageHead
        code="04.4"
        section="Progresso"
        title="Modo Seleção"
        lede="Etapas contra bots, em ordem. Cada vitória libera a próxima. A primeira vitória paga a recompensa cheia; repetir paga menos e pode dar equipamento."
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Etapas vencidas</span>
            <span className="big big--md">
              {cleared}/{all.length}
            </span>
          </div>
        }
      />
      {groups.map((g, gi) => {
        const cos = g.group.completionCosmetic ? findCosmetic(g.group.completionCosmetic) : null;
        return (
          <section key={g.group.id} className="selgroup">
            <div className="selgroup__head">
              <span className="selgroup__idx num">{String(gi + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="selgroup__name">{g.group.name}</h2>
                <p className="ink-2" style={{ margin: '4px 0 0' }}>
                  {g.group.description}
                </p>
              </div>
              <div className="selgroup__done">
                {g.completed ? <Tag color="var(--success)">Concluída</Tag> : <Tag>Em andamento</Tag>}
                {cos ? <span className="t-mono muted" style={{ fontSize: 12 }}>Ao concluir: {cos.name}</span> : null}
              </div>
            </div>
            <div className="stages">
              {g.stages.map((st, i) => {
                const s = st.stage;
                const state = st.cleared ? 'cleared' : st.unlocked ? 'open' : 'locked';
                return (
                  <article key={s.id} className={`stage is-${state}${s.boss ? ' is-boss' : ''}`}>
                    <div className="stage__top">
                      <span className="stage__code">
                        {s.boss ? 'CHEFE' : `ETAPA ${String(i + 1).padStart(2, '0')}`} · {s.mode}
                      </span>
                      <span className={`stage__state stage__state--${state}`}>{state === 'cleared' ? 'Vencida' : state === 'open' ? 'Liberada' : 'Bloqueada'}</span>
                    </div>
                    <h3 className="stage__name">{s.name}</h3>
                    <p className="stage__sub">{s.subtitle}</p>
                    <div className="stage__opp">
                      {s.opponents.map((o) => {
                        const l = getLineage(o.lineageId);
                        return (
                          <div key={o.name} className="opp">
                            <span className="opp__name">{o.name}</span>
                            <span className="t-mono" style={{ color: RARITY_COLORS[l.rarity], fontSize: 12 }}>
                              {l.name} · NV {o.level}
                            </span>
                            <span className="t-mono muted" style={{ fontSize: 11 }}>
                              {POSITION_LABEL[o.position]} · {PERSONALITY_LABEL[o.personality]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <dl className="sheet">
                      <dt>Dificuldade</dt>
                      <dd>{DIFFICULTY_LABEL[s.difficulty]}</dd>
                      <dt>Formato</dt>
                      <dd>
                        {s.rules.halves}x{s.rules.turnsPerHalf} lances{s.rules.firstTo ? ` · primeiro a ${s.rules.firstTo}` : ''}
                      </dd>
                      <dt>Orçamento rival</dt>
                      <dd>{s.rarityBudget}</dd>
                      <dt>1ª vitória</dt>
                      <dd>{rewardText(s.firstReward)}</dd>
                      <dt>Repetição</dt>
                      <dd>{rewardText(s.repeatReward)}</dd>
                      {s.dropItem ? (
                        <>
                          <dt>Drop</dt>
                          <dd>
                            {getEquipment(s.dropItem).name} · {pct(s.dropChance)}
                            {s.boss ? ' (garantido na 1ª)' : ''}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    <div className="stage__foot t-mono">
                      {st.wins} vitória{st.wins === 1 ? '' : 's'} em {st.attempts} tentativa{st.attempts === 1 ? '' : 's'}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="muted" style={{ fontSize: 14 }}>
        As partidas do Modo Seleção são jogadas no Discord. Aqui fica o registro.
      </p>
    </>
  );
}
