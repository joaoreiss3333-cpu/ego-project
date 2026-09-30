import type { Metadata } from 'next';
import Link from 'next/link';
import { ATTR_LABEL, EQUIPMENT, GAME, PROGRESSION, SITE_PATHS } from '@ego/content';
import { capsOf, inventory } from '@ego/db';
import { equipItemAction, unequipItemAction, upgradeItemAction } from '@/actions/items';
import { ActionForm, SubmitButton } from '@/components/forms';
import { NoCharacter, PageHead, Panel, Tag } from '@/components/ui';
import { fmt } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Equipamentos' };

const SLOT_LABEL = { chuteira: 'Chuteira', caneleira: 'Caneleira' } as const;

export default async function EquipamentosPage() {
  const v = await requireViewer(SITE_PATHS.equipamentos);
  if (!v.character) return <NoCharacter />;
  const inv = await inventory(v.character.id);
  const c = inv.character;
  const caps = capsOf(c);

  return (
    <>
      <PageHead
        code="03.1"
        section="Inventário"
        title="Equipamentos"
        lede={`Um item por encaixe. O bônus soma no atributo, mas o valor final nunca passa do teto da linhagem em mais de ${PROGRESSION.equipmentOverCap}.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">{GAME.commonCurrency.plural}</span>
            <span className="big big--md">{fmt(c.ienes)}</span>
          </div>
        }
      />

      {inv.equipment.length ? (
        <div className="cards">
          {inv.equipment.map((it) => {
            const def = it.def;
            const lvl = Math.min(2, Math.max(0, it.level));
            const bonus = def.bonusByLevel[lvl];
            const nextCost = lvl < 2 ? def.upgradeCost[lvl] : null;
            const base = c[def.attr] as number;
            const final = Math.min(base + bonus, Math.max(base, caps[def.attr] + PROGRESSION.equipmentOverCap));
            return (
              <article key={it.id} className={`card item${it.equipped ? ' is-on' : ''}`}>
                <div className="row row--between">
                  <span className="label">
                    {SLOT_LABEL[def.slot]} · {ATTR_LABEL[def.attr]}
                  </span>
                  {it.equipped ? <Tag color="var(--electric-2)">Equipado</Tag> : <Tag>Guardado</Tag>}
                </div>
                <div className="item__head">
                  <ItemGlyph slot={def.slot} />
                  <div>
                    <div className="card__title">{def.name}</div>
                    <div className="item__lvl">
                      <span className="num">+{lvl}</span>
                      <span className="t-mono muted">
                        bônus +{bonus} {ATTR_LABEL[def.attr]}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="card__text">{def.description}</p>
                <dl className="sheet">
                  <dt>{ATTR_LABEL[def.attr]} com o item</dt>
                  <dd>
                    {base} → {final}
                    {final < base + bonus ? ' (limite do teto)' : ''}
                  </dd>
                  <dt>Níveis</dt>
                  <dd>{def.bonusByLevel.map((b, i) => `+${i}: +${b}`).join(' · ')}</dd>
                </dl>
                <div className="row">
                  {it.equipped ? (
                    <ActionForm action={unequipItemAction}>
                      <input type="hidden" name="itemId" value={it.id} />
                      <SubmitButton className="btn btn--ghost btn--sm">Guardar</SubmitButton>
                    </ActionForm>
                  ) : (
                    <ActionForm action={equipItemAction}>
                      <input type="hidden" name="itemId" value={it.id} />
                      <SubmitButton className="btn btn--primary btn--sm">Equipar</SubmitButton>
                    </ActionForm>
                  )}
                  {nextCost !== null ? (
                    <ActionForm action={upgradeItemAction}>
                      <input type="hidden" name="itemId" value={it.id} />
                      <SubmitButton className="btn btn--ghost btn--sm" disabled={c.ienes < nextCost} title={c.ienes < nextCost ? `Faltam ${fmt(nextCost - c.ienes)}` : undefined}>
                        Melhorar para +{lvl + 1} <span className="btn__cost">{fmt(nextCost)} {GAME.commonCurrency.short}</span>
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <span className="label amber">Nível máximo</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Panel title="Inventário vazio" code="0 ITENS">
          <p className="ink-2" style={{ margin: 0 }}>
            Equipamentos caem no <Link href={SITE_PATHS.selecao}>Modo Seleção</Link>. Veja abaixo onde cada um aparece.
          </p>
        </Panel>
      )}

      <div className="rule">
        <b>Catálogo</b> Todos os equipamentos da instalação
      </div>
      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Encaixe</th>
              <th>Atributo</th>
              <th className="n">+0 / +1 / +2</th>
              <th className="n">Melhorar</th>
              <th>Onde conseguir</th>
            </tr>
          </thead>
          <tbody>
            {EQUIPMENT.map((e) => (
              <tr key={e.id}>
                <td>
                  <b>{e.name}</b>
                  {inv.equipment.some((x) => x.itemId === e.id) ? <span className="muted"> · você tem</span> : null}
                </td>
                <td>{SLOT_LABEL[e.slot]}</td>
                <td>{ATTR_LABEL[e.attr]}</td>
                <td className="n">{e.bonusByLevel.map((b) => `+${b}`).join(' / ')}</td>
                <td className="n">{e.upgradeCost.map((x) => fmt(x)).join(' / ')}</td>
                <td className="muted">{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemGlyph({ slot }: { slot: 'chuteira' | 'caneleira' }) {
  return (
    <svg viewBox="0 0 64 64" width={56} height={56} aria-hidden className="item__glyph">
      <path d="M8 2 H62 V54 L54 62 H2 V8 Z" fill="#0A111B" stroke="#26385A" strokeWidth={2} />
      {slot === 'chuteira' ? (
        <g fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="bevel">
          <path d="M14 22 L30 22 L34 34 L52 38 L52 46 L14 46 Z" />
          <path d="M18 50 V54 M28 50 V54 M38 50 V54 M48 50 V54" stroke="#4C8DFF" />
        </g>
      ) : (
        <g fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="bevel">
          <path d="M22 12 H42 L46 22 V50 L32 56 L18 50 V22 Z" />
          <path d="M24 26 H40 M24 34 H40 M24 42 H40" stroke="#4C8DFF" />
        </g>
      )}
    </svg>
  );
}
