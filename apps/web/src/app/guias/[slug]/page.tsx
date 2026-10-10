import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, GUIDE_CATEGORIES, SITE_PATHS, findGuide } from '@ego/content';
import { getGuideDoc, titleOf } from '@/guides';
import { BlockView, Rich } from '@/guides/render';
import { plain } from '@/guides/types';

// dinâmico: a barra de navegação depende da sessão
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = findGuide(slug);
  const doc = getGuideDoc(slug);
  if (!g || !doc) return { title: 'Guia' };
  return { title: g.title, description: plain(doc.summary, titleOf) };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findGuide(slug);
  const doc = getGuideDoc(slug);
  if (!entry || !doc) notFound();
  const catIdx = GUIDE_CATEGORIES.findIndex((c) => c.id === entry.category);
  const cat = GUIDE_CATEGORIES[catIdx];
  const idx = GUIDES.findIndex((g) => g.slug === slug);
  const prev = GUIDES[idx - 1];
  const next = GUIDES[idx + 1];

  return (
    <article className="guide">
      <header className="guide__head">
        <div className="phead__code">
          <b>{String(catIdx + 1).padStart(2, '0')}.{String(GUIDES.filter((g) => g.category === entry.category).findIndex((g) => g.slug === slug) + 1).padStart(2, '0')}</b> / {cat?.title}
        </div>
        <h1 className="guide__title">{entry.title}</h1>
        <div className="guide__summary">
          <span className="label">Resumo</span>
          <p>
            <Rich text={doc.summary} />
          </p>
        </div>
        <nav className="guide__toc" aria-label="Nesta página">
          {doc.sections.map((s, i) => (
            <a key={i} href={`#passo-${i + 1}`}>
              <em>{String(i + 1).padStart(2, '0')}</em> {s.title}
            </a>
          ))}
          {doc.examples.length ? (
            <a href="#exemplos">
              <em>EX</em> Exemplos
            </a>
          ) : null}
          <a href="#duvidas">
            <em>?</em> Dúvidas comuns
          </a>
        </nav>
      </header>

      {doc.sections.map((s, i) => (
        <section key={i} className="guide__sec" id={`passo-${i + 1}`}>
          <h2 className="guide__h">
            <span className="guide__n">Passo {String(i + 1).padStart(2, '0')}</span>
            {s.title}
          </h2>
          <div className="guide__body">
            {s.blocks.map((b, j) => (
              <BlockView key={j} b={b} />
            ))}
          </div>
        </section>
      ))}

      {doc.examples.length ? (
        <section className="guide__sec" id="exemplos">
          <h2 className="guide__h">
            <span className="guide__n">Campo</span>
            Exemplos ilustrados
          </h2>
          <div className="guide__examples">
            {doc.examples.map((ex, i) => (
              <div key={i} className="gex">
                <h3 className="gex__t">
                  <em>EX {String(i + 1).padStart(2, '0')}</em> {ex.title}
                </h3>
                <div className="gex__fig">{ex.figure}</div>
                <p className="gex__text">
                  <Rich text={ex.text} />
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="guide__sec" id="duvidas">
        <h2 className="guide__h">
          <span className="guide__n">Perguntas</span>
          Dúvidas comuns
        </h2>
        <div className="faq">
          {doc.faq.map((f, i) => (
            <details key={i} className="faq__i" open={i === 0}>
              <summary>{f.q}</summary>
              <p>
                <Rich text={f.a} />
              </p>
            </details>
          ))}
        </div>
      </section>

      {doc.related?.length ? (
        <section className="guide__related">
          <span className="label">Leia também</span>
          <div className="row">
            {doc.related.map((r) => (
              <Link key={r} href={SITE_PATHS.guia(r)} className="btn btn--ghost btn--sm">
                {titleOf(r)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <nav className="guide__pn" aria-label="Guia anterior e próximo">
        {prev ? (
          <Link href={SITE_PATHS.guia(prev.slug)} className="guide__pn-l">
            <span className="label">Anterior</span>
            <b>{prev.title}</b>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={SITE_PATHS.guia(next.slug)} className="guide__pn-r">
            <span className="label">Próximo</span>
            <b>{next.title}</b>
          </Link>
        ) : null}
      </nav>

    </article>
  );
}
