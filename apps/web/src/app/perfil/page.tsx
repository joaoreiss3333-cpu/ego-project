import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SITE_PATHS } from '@ego/content';
import { profileView } from '@ego/db';
import { ProfileBody } from '@/components/ProfileBody';
import { NoCharacter, PageHead } from '@/components/ui';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Perfil' };

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const { u } = await searchParams;
  if (u && /^\d{5,25}$/.test(u)) redirect(`${SITE_PATHS.perfil}/${u}`);
  const v = await requireViewer(SITE_PATHS.perfil);
  if (!v.character) {
    return (
      <>
        <PageHead code="01" section="Perfil" title="Ficha do jogador" />
        <NoCharacter />
      </>
    );
  }
  const view = await profileView(v.character.id);
  return (
    <>
      <PageHead
        code="01"
        section="Perfil"
        title={view.character.name}
        lede="Sua ficha na instalação. Tudo aqui vem das partidas: ninguém edita número na mão."
      />
      <ProfileBody view={view} own />
    </>
  );
}
