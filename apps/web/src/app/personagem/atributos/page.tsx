import type { Metadata } from 'next';
import Link from 'next/link';
import { ATTRS, ATTR_LABEL, ATTR_SHORT, GAME, PROGRESSION, SITE_PATHS, tokenCostForAttr } from '@ego/content';
import { NO_LINEAGE_CAP, profileView } from '@ego/db';
import { allocateAttributeAction, resetAttributesAction } from '@/actions/character';
import { ActionForm, ConfirmAction, SubmitButton } from '@/components/forms';
import { NoCharacter, PageHead, Panel, SegBar, Sheet } from '@/components/ui';
import { fmt, fmtDuration, plural } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Atributos' };

export default async function AtributosPage() {
  const v = await requireViewer(SITE_PATHS.atributos);
  if (!v.character) return <NoCharacter />;
  const view = await profileView(v.character.id);
  const c = view.character;
  const lastReset = c.lastAttrResetAt?.getTime() ?? 0;
  const cooldownMs = Math.max(0, lastReset + PROGRESSION.reset.cooldownHours * 3600_000 - Date.now());
  const refundPoints = ATTRS.reduce((a, k) => a + (view.base[k] - PROGRESSION.attrStart), 0);
  const noPoints = c.attrPoints < 1;

  return (
    <>
      <PageHead
        code="02.1"
        section="Personagem"
        title="Atributos"
        lede={
          view.lineage
            ? `Os tetos vêm da linhagem ${view.lineage.name}. Até ${PROGRESSION.freeUpTo}, subir custa só 1 ponto. Acima disso, também custa Fichas de Treino do atributo.`
            : `Sem linhagem, o teto de tudo é ${NO_LINEAGE_CAP}. Faça o giro gratuito para liberar os tetos reais.`
        }
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Pontos de Atributo</span>
            <span className={`big${noPoints ? ' muted' : ''}`}>{c.attrPoints}</span>
          </div>
        }
      />

      <div className="side-r">
        <Panel title="Distribuição" code={`MÁX ${PROGRESSION.attrMax} · EQUIPAMENTO ATÉ TETO +${PROGRESSION.equipmentOverCap}`}>
          <div className="attrs">
            <div className="attrs__legend">
              <span>
                <i className="seg is-on" /> Base
              </span>
              <span>
                <i className="seg is-bonus" /> Equipamento
              </span>
              <span>
                <i className="seg is-over" /> Acima do teto
              </span>
            </div>
            {view.costs.map((cost) => {
              const k = cost.attr;
              const bonus = view.effective[k] - view.base[k];
              return (
                <div key={k} className={`attr${cost.ok ? ' is-ok' : ''}`}>
                  <div className="attr__name">
                    <span className="attr__short">{ATTR_SHORT[k]}</span>
                    <span className="attr__label">{ATTR_LABEL[k]}</span>
                  </div>
                  <div className="attr__val">
                    <span className="num">{view.base[k]}</span>
                    {bonus > 0 ? <span className="attr__bonus">+{bonus}</span> : null}
                  </div>
                  <div className="attr__bar">
                    <SegBar base={view.base[k]} bonus={bonus} cap={Math.min(view.caps[k], PROGRESSION.attrMax)} n={PROGRESSION.attrMax + PROGRESSION.equipmentOverCap} />
                    <span className="attr__cap">
                      Teto {view.caps[k]} · Fichas {fmt(view.tokens[k])}
                    </span>
                  </div>
                  <div className="attr__cost">
                    {cost.target <= Math.min(cost.cap, PROGRESSION.attrMax) ? (
                      <>
                        <span className="label">Para {cost.target}</span>
                        <span className="t-mono">
                          1 pt{cost.tokens ? ` + ${cost.tokens} fichas` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="label amber">No teto</span>
                    )}
                  </div>
                  <ActionForm action={allocateAttributeAction} className="attr__act">
                    <input type="hidden" name="attr" value={k} />
                    <SubmitButton className="btn btn--primary btn--sm" disabled={!cost.ok} pendingText="..." title={cost.reason ?? `Subir ${ATTR_LABEL[k]}`}>
                      +1
                    </SubmitButton>
                  </ActionForm>
                  {!cost.ok && cost.reason ? <div className="attr__why">{cost.reason}</div> : null}
                </div>
              );
            })}
          </div>
          <AllocFeedback />
        </Panel>

        <div className="stack">
          <Panel title="Custo por valor" code="FICHAS DE TREINO">
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Subir para</th>
                    <th className="n">Pontos</th>
                    <th className="n">Fichas</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: PROGRESSION.attrMax - PROGRESSION.attrStart }, (_, i) => PROGRESSION.attrStart + 1 + i).map((t) => (
                    <tr key={t}>
                      <td className="t-mono">{t}</td>
                      <td className="n">{PROGRESSION.attributePointsPerLevel}</td>
                      <td className="n">{tokenCostForAttr(t) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
              Fichas vêm de treinos, partidas e do Modo Seleção. <Link href={SITE_PATHS.guia('fichas-de-treino')}>Como conseguir</Link>.
            </p>
          </Panel>

          <Panel title="Reset de atributos" code={`RECARGA ${PROGRESSION.reset.cooldownHours}H`} tone="alert">
            <Sheet
              rows={[
                ['Custo', `${fmt(PROGRESSION.reset.attributesCost)} ${GAME.commonCurrency.plural}`],
                ['Você tem', `${fmt(c.ienes)} ${GAME.commonCurrency.plural}`],
                ['Pontos devolvidos', fmt(refundPoints)],
                ['Fichas gastas', 'devolvidas'],
              ]}
            />
            <div style={{ marginTop: 14 }}>
              <ConfirmAction
                action={resetAttributesAction}
                label="Resetar atributos"
                question="Voltar todos os atributos para 3?"
                detail={`Custa ${fmt(PROGRESSION.reset.attributesCost)} ${GAME.commonCurrency.plural}. Você recebe ${plural(refundPoints, 'ponto', 'pontos')} e as fichas de volta. Só dá para repetir depois de ${PROGRESSION.reset.cooldownHours} horas.`}
                confirmLabel="Resetar agora"
                disabled={cooldownMs > 0 || refundPoints === 0}
                disabledReason={cooldownMs > 0 ? `Disponível em ${fmtDuration(cooldownMs)}` : refundPoints === 0 ? 'Nada para resetar' : undefined}
              />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

/** Aviso fixo: distribuir é imediato. */
function AllocFeedback() {
  return (
    <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>
      Cada clique gasta na hora. Sem desfazer: para redistribuir, use o reset.
    </p>
  );
}
