import { GUIDES, findGuide } from '@ego/content';
import { comandos, criacao, primeirosPassos } from './docs/comecando';
import { duelos, estruturaDoLance, movimento, zonaDeControle } from './docs/partida-a';
import { acoesAtaque, acoesDefesa, chuteEGoleiro, leitura, passe } from './docs/partida-b';
import { egoEQuimica, flow, folego, modosECampos, orcamento } from './docs/partida-c';
import { arvore, atributos, fichas, linhagens, loadout, maestria, niveis } from './docs/personagem';
import { limites, missoes, modoSelecao, recompensas, treinos } from './docs/grind';
import { cosmeticos, equipamentos, giro, ranking } from './docs/outros';
import { docText, type GuideDoc } from './types';

const ALL: GuideDoc[] = [
  primeirosPassos,
  criacao,
  comandos,
  estruturaDoLance,
  movimento,
  zonaDeControle,
  duelos,
  passe,
  acoesAtaque,
  acoesDefesa,
  leitura,
  chuteEGoleiro,
  folego,
  flow,
  egoEQuimica,
  modosECampos,
  orcamento,
  atributos,
  niveis,
  fichas,
  linhagens,
  arvore,
  loadout,
  maestria,
  treinos,
  modoSelecao,
  missoes,
  recompensas,
  limites,
  equipamentos,
  cosmeticos,
  giro,
  ranking,
];

const bySlug = new Map(ALL.map((d) => [d.slug, d]));

// O bot linka para estes slugs: todo slug do índice precisa de um guia (falha no build se faltar).
const missing = GUIDES.filter((g) => !bySlug.has(g.slug)).map((g) => g.slug);
if (missing.length) throw new Error(`Guias sem conteúdo: ${missing.join(', ')}`);

export function getGuideDoc(slug: string): GuideDoc | undefined {
  return bySlug.get(slug);
}

export const titleOf = (slug: string) => findGuide(slug)?.title ?? slug;

export interface SearchEntry {
  slug: string;
  title: string;
  category: string;
  keywords: string[];
  text: string;
}

let cached: SearchEntry[] | null = null;
export function searchIndex(): SearchEntry[] {
  if (cached) return cached;
  cached = GUIDES.map((g) => ({
    slug: g.slug,
    title: g.title,
    category: g.category,
    keywords: g.keywords,
    text: docText(bySlug.get(g.slug)!, titleOf),
  }));
  return cached;
}
