import type { ReactNode } from 'react';
import { GUIDES, GUIDE_CATEGORIES } from '@ego/content';
import { GuideNav } from '@/components/GuideNav';
import { GuideSearch } from '@/components/GuideSearch';

export default function GuidesLayout({ children }: { children: ReactNode }) {
  const cats = GUIDE_CATEGORIES.map((c) => ({
    id: c.id,
    title: c.title,
    guides: GUIDES.filter((g) => g.category === c.id).map((g) => ({ slug: g.slug, title: g.title })),
  }));
  return (
    <div className="guides">
      <aside className="guides__side">
        <GuideSearch categories={Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.id, c.title]))} />
        <GuideNav cats={cats} />
      </aside>
      <div className="guides__main">{children}</div>
    </div>
  );
}
