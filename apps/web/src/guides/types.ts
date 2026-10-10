import type { ReactNode } from 'react';

/**
 * Bloco de conteúdo de um guia. Texto aceita **negrito** e [[slug]] ou
 * [[slug|texto]] para ligar outro guia.
 */
export type Block =
  | string
  | { h: string }
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: (string | number)[][]; caption?: string } }
  | { figure: ReactNode; text?: string; wide?: boolean }
  | { note: string; tone?: 'tip' | 'warn' };

export interface GuideSection {
  title: string;
  blocks: Block[];
}

export interface GuideExample {
  title: string;
  figure: ReactNode;
  /** Explicação da jogada (também entra na busca). */
  text: string;
}

export interface GuideDoc {
  slug: string;
  /** Resumo curto no topo. */
  summary: string;
  /** Explicação passo a passo. */
  sections: GuideSection[];
  /** Exemplos ilustrados de jogadas. */
  examples: GuideExample[];
  faq: { q: string; a: string }[];
  related?: string[];
}

const MARKUP = /\*\*([^*]+)\*\*|\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

/** Texto puro (para a busca). */
export function plain(s: string, titleOf: (slug: string) => string): string {
  return s.replace(MARKUP, (_m, bold: string | undefined, slug: string | undefined, label: string | undefined) => bold ?? label ?? (slug ? titleOf(slug) : ''));
}

export function docText(doc: GuideDoc, titleOf: (slug: string) => string): string {
  const parts: string[] = [doc.summary];
  for (const s of doc.sections) {
    parts.push(s.title);
    for (const b of s.blocks) {
      if (typeof b === 'string') parts.push(b);
      else if ('h' in b) parts.push(b.h);
      else if ('list' in b) parts.push(...b.list);
      else if ('table' in b) parts.push(b.table.head.join(' '), ...b.table.rows.map((r) => r.join(' ')), b.table.caption ?? '');
      else if ('figure' in b) parts.push(b.text ?? '');
      else if ('note' in b) parts.push(b.note);
    }
  }
  for (const e of doc.examples) parts.push(e.title, e.text);
  for (const f of doc.faq) parts.push(f.q, f.a);
  return parts.map((p) => plain(p, titleOf)).join(' \n ');
}
