import type { ReactNode } from 'react';
import Link from 'next/link';
import { GAME, SITE_PATHS, type Rarity } from '@ego/content';
import { logoSvg } from '@ego/render/svg';
import { signOutAction } from '@/actions/auth';
import { NavBar } from './NavBar';
import { SiteClock } from './SiteClock';

export interface ShellViewer {
  name: string;
  number: number | null;
  characterId: string | null;
  portraitVersion: number;
  lineageName: string | null;
  rarity: Rarity | null;
  level: number | null;
}

const LOGO = logoSvg({ height: 26 });

export function Shell({ viewer, children }: { viewer: ShellViewer | null; children: ReactNode }) {
  return (
    <>
      <NavBar
        viewer={viewer}
        logo={
          <Link href={viewer ? SITE_PATHS.perfil : '/'} className="brand" aria-label={`${GAME.name}: início`} dangerouslySetInnerHTML={{ __html: LOGO }} />
        }
        signOut={
          <form action={signOutAction}>
            <button type="submit" className="btn btn--ghost btn--sm">
              Sair
            </button>
          </form>
        }
      />
      <main className="main" id="conteudo">
        {children}
      </main>
      <footer className="foot">
        <div className="foot__row">
          <span>
            {GAME.name} / {GAME.tagline}
          </span>
          <SiteClock />
          <span>
            <Link href={SITE_PATHS.guias} className="muted">
              Central de guias
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
