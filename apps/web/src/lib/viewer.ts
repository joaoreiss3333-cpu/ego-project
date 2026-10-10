import { cache } from 'react';
import { redirect } from 'next/navigation';
import { findCharacter, type Character } from '@ego/db';
import { auth } from '@/auth';
import { SITE_PATHS } from '@ego/content';

export interface Viewer {
  discordId: string;
  name: string | null;
  character: Character | null;
}

/** Quem está vendo a página (null se não entrou). Cacheado por requisição. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth();
  const discordId = (session as { discordId?: string } | null)?.discordId;
  if (!discordId) return null;
  const character = await findCharacter(discordId);
  return { discordId, name: session?.user?.name ?? null, character };
});

/** Exige login; sem sessão vai para /entrar e volta depois. */
export async function requireViewer(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`${SITE_PATHS.login}?next=${encodeURIComponent(next)}`);
  return v;
}
