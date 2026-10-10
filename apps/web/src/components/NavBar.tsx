'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SITE_PATHS } from '@ego/content';
import { NAV, activeSection } from '@/lib/nav';
import { artUrl } from '@/lib/art';
import type { ShellViewer } from './Shell';

export function NavBar({ viewer, logo, signOut }: { viewer: ShellViewer | null; logo: ReactNode; signOut: ReactNode }) {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const section = activeSection(pathname);
  const sections = viewer ? NAV : NAV.filter((s) => s.public);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isLeafActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="topbar">
      <div className="topbar__row">
        {logo}
        <nav className="tabs" aria-label="Seções">
          {sections.map((s) => (
            <Link key={s.code} href={s.href} className={`tab${section?.code === s.code ? ' is-active' : ''}`} aria-current={section?.code === s.code ? 'page' : undefined}>
              <span className="tab__code">{s.code}</span>
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="topbar__here" aria-hidden>
          {section ? `${section.code} / ${section.label}` : ''}
        </div>
        <div className="topbar__side">
          {viewer ? (
            <>
              <Link href={SITE_PATHS.perfil} className="who" title="Seu perfil">
                {viewer.characterId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artUrl.portrait(viewer.characterId, viewer.portraitVersion)} alt="" width={30} height={30} />
                ) : null}
                <span>
                  <span className="who__name">{viewer.name}</span>
                  <span className="who__meta">
                    {viewer.number !== null ? `#${viewer.number}` : 'sem registro'}
                    {viewer.level !== null ? ` · NV ${viewer.level}` : ''}
                  </span>
                </span>
              </Link>
              <span className="hide-mobile">{signOut}</span>
            </>
          ) : (
            <Link href={SITE_PATHS.login} className="btn btn--primary btn--sm">
              Entrar
            </Link>
          )}
          <button type="button" className="menu-btn" aria-expanded={open} aria-controls="menu-movel" onClick={() => setOpen((o) => !o)}>
            {open ? 'Fechar' : 'Menu'}
          </button>
        </div>
      </div>
      {section?.children ? (
        <div className="subtabs">
          <nav className="subtabs__row" aria-label={section.label}>
            <span className="subtabs__section">{section.label}</span>
            {section.children.map((c) => (
              <Link key={c.href} href={c.href} className={`subtab${isLeafActive(c.href) ? ' is-active' : ''}`} aria-current={isLeafActive(c.href) ? 'page' : undefined}>
                {c.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
      <div className="mobile-menu" id="menu-movel" hidden={!open}>
        {sections.map((s) => (
          <div className="mm-group" key={s.code}>
            <Link href={s.href} className={`mm-link${section?.code === s.code ? ' is-active' : ''}`}>
              <span>{s.code}</span>
              {s.label}
            </Link>
            {s.children ? (
              <div className="mm-subs">
                {s.children.map((c) => (
                  <Link key={c.href} href={c.href} className={`mm-sub${isLeafActive(c.href) ? ' is-active' : ''}`}>
                    {c.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {viewer ? <div style={{ paddingTop: 16 }}>{signOut}</div> : null}
      </div>
    </header>
  );
}
