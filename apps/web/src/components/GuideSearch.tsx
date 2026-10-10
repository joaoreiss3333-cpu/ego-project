'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Entry {
  slug: string;
  title: string;
  category: string;
  keywords: string[];
  text: string;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

function snippet(text: string, q: string): string {
  const n = norm(text);
  const i = n.indexOf(q);
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - 50);
  return `${start > 0 ? '...' : ''}${text.slice(start, i + q.length + 70).replace(/\s+/g, ' ').trim()}...`;
}

/** Busca por palavra nos títulos, palavras-chave e texto dos guias (no navegador). */
export function GuideSearch({ autoFocus, categories }: { autoFocus?: boolean; categories: Record<string, string> }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const loading = useRef(false);

  const load = () => {
    if (data || loading.current) return;
    loading.current = true;
    fetch('/api/guias/indice')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Entry[]) => setData(d))
      .catch(() => setError(true))
      .finally(() => (loading.current = false));
  };

  useEffect(() => {
    if (autoFocus) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const results = useMemo(() => {
    const term = norm(q.trim());
    if (!data || term.length < 2) return [];
    const words = term.split(/\s+/).filter(Boolean);
    return data
      .map((e) => {
        const title = norm(e.title);
        const kw = norm(e.keywords.join(' '));
        const body = norm(e.text);
        let score = 0;
        for (const w of words) {
          if (title.includes(w)) score += 10;
          if (kw.includes(w)) score += 5;
          if (body.includes(w)) score += 1 + Math.min(4, body.split(w).length - 1);
          else if (!title.includes(w) && !kw.includes(w)) return null;
        }
        return { e, score };
      })
      .filter((x): x is { e: Entry; score: number } => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [q, data]);

  return (
    <div className="gsearch">
      <label className="gsearch__box">
        <span className="label">Buscar nos guias</span>
        <input
          className="input"
          type="search"
          value={q}
          placeholder="ex.: bote, passe no espaço, garantia"
          onFocus={load}
          onChange={(e) => {
            load();
            setQ(e.target.value);
          }}
          autoFocus={autoFocus}
          aria-controls="gsearch-results"
        />
      </label>
      <div id="gsearch-results" aria-live="polite">
        {error ? <p className="flash flash--err">Não foi possível carregar a busca.</p> : null}
        {q.trim().length >= 2 && data ? (
          results.length ? (
            <ul className="gsearch__list">
              {results.map(({ e }) => (
                <li key={e.slug}>
                  <Link href={`/guias/${e.slug}`} className="gsearch__hit">
                    <span className="label">{categories[e.category] ?? e.category}</span>
                    <b>{e.title}</b>
                    <span className="gsearch__snip">{snippet(e.text, norm(q.trim().split(/\s+/)[0]))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted gsearch__none">Nada encontrado para “{q.trim()}”.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
