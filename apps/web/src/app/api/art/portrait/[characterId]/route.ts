import { COLORS } from '@ego/content';
import { prisma } from '@ego/db';
import { portraitFile } from '@ego/render/assets';
import { playerSilhouetteSvg } from '@ego/render/svg';
import { fileResponse, notFound, svgResponse } from '@/lib/serve';

export const dynamic = 'force-dynamic';

/** Retrato enviado pelo jogador; sem arquivo, a silhueta na cor do token. */
export async function GET(_req: Request, { params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(characterId)) return notFound();
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { portraitPath: true, tokenColor: true, number: true } });
  if (!c) return svgResponse(playerSilhouetteSvg(COLORS.muted, undefined, 256), 60);
  const file = portraitFile(c.portraitPath);
  if (file) return fileResponse(file, 300);
  return svgResponse(playerSilhouetteSvg(c.tokenColor || COLORS.electric, c.number, 256), 300);
}
