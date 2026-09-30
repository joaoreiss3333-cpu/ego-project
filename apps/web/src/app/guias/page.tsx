import type { Metadata } from 'next';
import Link from 'next/link';
import { GAME, GUIDES, GUIDE_CATEGORIES, SITE_PATHS } from '@ego/content';
import { PageHead } from '@/components/ui';
import { getGuideDoc } from '@/guides';
import { plain } from '@/guides/types';
import { titleOf } from '@/guides';

export const metadata: Metadata = { title: 'Guias' };

export default function GuidesIndex() {
  return (
    <>
      <PageHead
        code="08"
        section="Central de guias"
        title="Manual da instalação"
        lede={`Todas as regras do ${GAME.name}, com os números do jogo. Quem chegou agora começa por Primeiros passos. Quem já joga encontra a regra exata na busca.`}
        aside={
          <div className="stack stack--tight" style={{ justifyItems: 'end' }}>
            <span className="label">Guias</span>
            <span className="big big--md">{GUIDES.length}</span>
          </div>
        }
      />
      <div className="gindex">
        {GUIDE_CATEGORIES.map((c, i) => (
          <section key={c.id} className="gindex__cat">
            <div className="rule">
              <b>{String(i + 1).padStart(2, '0')}</b> {c.title}
            </div>
            <div className="gindex__list">
              {GUIDES.filter((g) => g.category === c.id).map((g) => {
                const doc = getGuideDoc(g.slug);
                return (
                  <Link key={g.slug} href={SITE_PATHS.guia(g.slug)} className="gcard">
                    <span className="gcard__t">{g.title}</span>
                    <span className="gcard__s">{doc ? plain(doc.summary, titleOf) : ''}</span>
                    <span className="gcard__u t-mono">{SITE_PATHS.guia(g.slug)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
