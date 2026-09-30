import { SITE_PATHS } from '@ego/content';

export interface NavLeaf {
  href: string;
  label: string;
}

export interface NavSection {
  code: string;
  label: string;
  /** Prefixo da URL que marca a aba como ativa. */
  base: string;
  href: string;
  children?: NavLeaf[];
  /** Visível sem login. */
  public?: boolean;
}

/** Abas principais. As rotas são as mesmas que o bot usa (SITE_PATHS). */
export const NAV: NavSection[] = [
  { code: '01', label: 'Perfil', base: '/perfil', href: SITE_PATHS.perfil },
  {
    code: '02',
    label: 'Personagem',
    base: '/personagem',
    href: SITE_PATHS.atributos,
    children: [
      { href: SITE_PATHS.atributos, label: 'Atributos' },
      { href: SITE_PATHS.linhagem, label: 'Linhagem' },
      { href: SITE_PATHS.loadout, label: 'Loadout' },
    ],
  },
  {
    code: '03',
    label: 'Inventário',
    base: '/inventario',
    href: SITE_PATHS.equipamentos,
    children: [
      { href: SITE_PATHS.equipamentos, label: 'Equipamentos' },
      { href: SITE_PATHS.cosmeticos, label: 'Cosméticos' },
      { href: SITE_PATHS.materiais, label: 'Materiais' },
    ],
  },
  {
    code: '04',
    label: 'Progresso',
    base: '/progresso',
    href: SITE_PATHS.missoes,
    children: [
      { href: SITE_PATHS.missoes, label: 'Missões' },
      { href: SITE_PATHS.despertares, label: 'Despertares' },
      { href: SITE_PATHS.maestria, label: 'Maestria' },
      { href: SITE_PATHS.selecao, label: 'Seleção' },
    ],
  },
  { code: '05', label: 'Giro', base: '/giro', href: SITE_PATHS.giro },
  {
    code: '06',
    label: 'Ranking',
    base: '/ranking',
    href: SITE_PATHS.rankingSolo,
    children: [
      { href: SITE_PATHS.rankingSolo, label: 'Solo' },
      { href: SITE_PATHS.rankingTime, label: 'Time' },
    ],
  },
  { code: '07', label: 'Partidas', base: '/partidas', href: SITE_PATHS.partidas },
  { code: '08', label: 'Guias', base: '/guias', href: SITE_PATHS.guias, public: true },
];

export function activeSection(pathname: string): NavSection | undefined {
  return NAV.find((s) => pathname === s.base || pathname.startsWith(`${s.base}/`));
}
