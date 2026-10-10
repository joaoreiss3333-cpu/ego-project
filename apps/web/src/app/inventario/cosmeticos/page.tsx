import type { Metadata } from 'next';
import { SITE_PATHS, type AttrKey, type CosmeticType } from '@ego/content';
import { inventory, tokensOf } from '@ego/db';
import { craftCosmeticAction, equipCosmeticAction } from '@/actions/items';
import { CosmeticPreview as Preview } from '@/components/CosmeticPreview';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Meter, NoCharacter, PageHead, Tag } from '@/components/ui';
import { COSMETIC_TYPE_LABEL as TYPE_LABEL, unlockText } from '@/lib/cosmetics';
import { fmt } from '@/lib/format';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Cosméticos' };

export default async function CosmeticosPage() {
  const v = await requireViewer(SITE_PATHS.cosmeticos);
  if (!v.character) return <NoCharacter />;
  const inv = await inventory(v.character.id);
  const c = inv.character;
  const types: CosmeticType[] = ['moldura', 'titulo', 'rastro'];
  const tok = tokensOf(c);
  const ownedCount = inv.cosmetics.filter((x) => x.owned).length;

  return (
    <>
      <PageHead
        code="03.2"
        section="Inventário"
        title="Cosméticos"
        lede="Nenhum cosmético muda número em campo. Eles mostram o que você já fez."
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Liberados</span>
            <span className="big big--md">
              {ownedCount}/{inv.cosmetics.length}
            </span>
          </div>
        }
      />
      {types.map((type) => {
        const list = inv.cosmetics.filter((x) => x.def.type === type);
        return (
          <section key={type} className="cos-group">
            <div className="rule">
              <b>{TYPE_LABEL[type].title}</b> {TYPE_LABEL[type].hint}
            </div>
            <div className="cards">
              {list.map(({ def, owned, equipped }) => {
                const u = def.unlock;
                const craftable = u.kind === 'craft' && !owned;
                const canPay =
                  u.kind === 'craft' && c.ienes >= u.ienes && Object.entries(u.tokens).every(([k, n]) => tok[k as AttrKey] >= (n ?? 0));
                return (
                  <article key={def.id} className={`card cos${equipped ? ' is-on' : ''}${owned ? '' : ' is-locked'}`}>
                    <div className="row row--between">
                      <span className="label">{TYPE_LABEL[type].one}</span>
                      {equipped ? <Tag color="var(--electric-2)">Equipado</Tag> : owned ? <Tag color="var(--success)">Liberado</Tag> : <Tag>Bloqueado</Tag>}
                    </div>
                    <div className="cos__preview">
                      <Preview def={def} />
                    </div>
                    <div className="card__title">{def.name}</div>
                    {u.kind !== 'default' ? <p className="card__text">{def.description}</p> : null}
                    <div className="cos__unlock">
                      <span className="label">Como liberar</span>
                      <p>{unlockText(def)}</p>
                      {u.kind === 'stat' && !owned ? (
                        <>
                          <Meter value={Math.min(c.goals, u.value)} max={u.value} label="Gols" />
                          <span className="t-mono muted" style={{ fontSize: 12 }}>
                            {fmt(c.goals)}/{u.value} gols
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="row">
                      {owned && !equipped ? (
                        <ActionForm action={equipCosmeticAction}>
                          <input type="hidden" name="type" value={type} />
                          <input type="hidden" name="cosmeticId" value={def.id} />
                          <SubmitButton className="btn btn--primary btn--sm">Equipar</SubmitButton>
                        </ActionForm>
                      ) : null}
                      {equipped ? (
                        <ActionForm action={equipCosmeticAction}>
                          <input type="hidden" name="type" value={type} />
                          <input type="hidden" name="cosmeticId" value="" />
                          <SubmitButton className="btn btn--ghost btn--sm">Remover</SubmitButton>
                        </ActionForm>
                      ) : null}
                      {craftable ? (
                        <ActionForm action={craftCosmeticAction}>
                          <input type="hidden" name="cosmeticId" value={def.id} />
                          <SubmitButton className="btn btn--primary btn--sm" disabled={!canPay} title={canPay ? undefined : 'Recursos insuficientes'}>
                            Criar
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
