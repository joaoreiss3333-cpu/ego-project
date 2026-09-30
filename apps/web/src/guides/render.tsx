import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE_PATHS, findGuide } from '@ego/content';
import type { Block } from './types';

const MARKUP = /\*\*([^*]+)\*\*|\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const NUMERIC = /^(?:[-+]?[\d.,]+(?:%| XP| PL)?|—|-)$/;

/** Converte **negrito** e [[slug|texto]] em elementos. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  MARKUP.lastIndex = 0;
  while ((m = MARKUP.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={i++}>{m[1]}</strong>);
    else if (m[2]) {
      const g = findGuide(m[2]);
      out.push(
        <Link key={i++} href={SITE_PATHS.guia(m[2])}>
          {m[3] ?? g?.title ?? m[2]}
        </Link>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export function BlockView({ b }: { b: Block }) {
  if (typeof b === 'string')
    return (
      <p>
        <Rich text={b} />
      </p>
    );
  if ('h' in b) return <h4 className="g-h">{b.h}</h4>;
  if ('list' in b) {
    const items = b.list.map((t, i) => (
      <li key={i}>
        <Rich text={t} />
      </li>
    ));
    return b.ordered ? <ol className="g-list g-list--ol">{items}</ol> : <ul className="g-list">{items}</ul>;
  }
  if ('table' in b) {
    // coluna numérica (alinhada à direita) só quando todas as células parecem número
    const numeric = b.table.head.map((_, ci) => ci > 0 && b.table.rows.every((r) => typeof r[ci] === 'number' || NUMERIC.test(String(r[ci] ?? ''))));
    return (
      <div className="tablewrap g-table">
        <table className="table">
          <thead>
            <tr>
              {b.table.head.map((h, i) => (
                <th key={i} className={numeric[i] ? 'n' : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.table.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className={numeric[ci] ? 'n' : undefined}>
                    {typeof c === 'string' ? <Rich text={c} /> : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {b.table.caption ? <p className="g-cap">{b.table.caption}</p> : null}
      </div>
    );
  }
  if ('figure' in b) return <div className={`g-fig${b.wide ? ' g-fig--wide' : ''}`}>{b.figure}</div>;
  return (
    <div className={`g-note g-note--${b.tone ?? 'tip'}`}>
      <span className="label">{b.tone === 'warn' ? 'Atenção' : 'Da instalação'}</span>
      <p>
        <Rich text={b.note} />
      </p>
    </div>
  );
}
