import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { Anton, Barlow, Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import { COLORS, GAME, RARITIES, RARITY_COLORS, findLineage } from '@ego/content';
import { Shell, type ShellViewer } from '@/components/Shell';
import { getViewer } from '@/lib/viewer';
import '@/styles/base.css';
import '@/styles/shell.css';
import '@/styles/ui.css';
import '@/styles/pages.css';
import '@/styles/tree.css';
import '@/styles/spin.css';
import '@/styles/field.css';
import '@/styles/guides.css';

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--f-anton', display: 'swap' });
const barlow = Barlow({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--f-barlow', display: 'swap' });
const barlowCond = Barlow_Condensed({ weight: ['500', '600', '700'], subsets: ['latin'], variable: '--f-barlowc', display: 'swap' });
const plex = IBM_Plex_Mono({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--f-plex', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: { default: GAME.name, template: `%s · ${GAME.name}` },
  description: `${GAME.tagline}. Perfil, árvore de linhagem, ranking, replays e guias.`,
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: COLORS.background,
  width: 'device-width',
  initialScale: 1,
};

/** Paleta vem do conteúdo: trocar em packages/content muda o site inteiro. */
const palette = {
  '--bg': COLORS.background,
  '--panel': COLORS.panel,
  '--line': COLORS.line,
  '--electric': COLORS.electric,
  '--electric-2': COLORS.electricBright,
  '--white': COLORS.white,
  '--muted': COLORS.muted,
  '--alert': COLORS.alert,
  '--amber': COLORS.amber,
  '--success': COLORS.success,
  '--team-a': COLORS.teamA,
  '--team-b': COLORS.teamB,
  ...Object.fromEntries(RARITIES.map((r) => [`--r-${r}`, RARITY_COLORS[r]])),
} as CSSProperties;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  let shellViewer: ShellViewer | null = null;
  if (viewer) {
    const c = viewer.character;
    const lineage = findLineage(c?.lineageId);
    shellViewer = {
      name: c?.name ?? viewer.name ?? 'Sem personagem',
      number: c?.number ?? null,
      characterId: c?.id ?? null,
      portraitVersion: c?.updatedAt.getTime() ?? 0,
      lineageName: lineage?.name ?? null,
      rarity: lineage?.rarity ?? null,
      level: c?.level ?? null,
    };
  }
  return (
    <html lang="pt-BR" className={`${anton.variable} ${barlow.variable} ${barlowCond.variable} ${plex.variable}`} style={palette}>
      <body>
        <Shell viewer={shellViewer}>{children}</Shell>
      </body>
    </html>
  );
}
