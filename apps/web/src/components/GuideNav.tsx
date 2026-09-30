'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface Cat {
  id: string;
  title: string;
  guides: { slug: string; title: string }[];
}

/** Índice lateral por categoria. No celular vira um bloco recolhível. */
export function GuideNav({ cats }: { cats: Cat[] }) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const current = pathname.split('/')[2] ?? '';
  return (
    <nav className={`gnav${open ? ' is-open' : ''}`} aria-label="Índice dos guias">
      <button type="button" className="gnav__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Índice {open ? '−' : '+'}
      </button>
      <div className="gnav__body">
        <Link href="/guias" className={`gnav__home${current === '' ? ' is-active' : ''}`}>
          Todos os guias
        </Link>
        {cats.map((c, i) => (
          <div key={c.id} className="gnav__cat">
            <span className="gnav__ct">
              <em>{String(i + 1).padStart(2, '0')}</em> {c.title}
            </span>
            <ul>
              {c.guides.map((g) => (
                <li key={g.slug}>
                  <Link href={`/guias/${g.slug}`} className={current === g.slug ? 'is-active' : undefined} aria-current={current === g.slug ? 'page' : undefined} onClick={() => setOpen(false)}>
                    {g.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
