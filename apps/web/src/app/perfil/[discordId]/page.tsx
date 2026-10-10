import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SITE_PATHS } from '@ego/content';
import { findCharacter, profileView } from '@ego/db';
import { ProfileBody } from '@/components/ProfileBody';
import { PageHead } from '@/components/ui';
import { requireViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'Perfil de jogador' };

export default async function OtherProfilePage({ params }: { params: Promise<{ discordId: string }> }) {
  const { discordId } = await params;
  const v = await requireViewer(`${SITE_PATHS.perfil}/${discordId}`);
  if (v.discordId === discordId) redirect(SITE_PATHS.perfil);
  if (!/^\d{5,25}$/.test(discordId)) notFound();
  const c = await findCharacter(discordId);
  if (!c) notFound();
  const view = await profileView(c.id);
  return (
    <>
      <PageHead code="01" section="Perfil / Observação" title={c.name} lede="Ficha pública de outro jogador. Moedas, energia e materiais não aparecem aqui." />
      <ProfileBody view={view} own={false} />
    </>
  );
}
