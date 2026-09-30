import { findSkill } from '@ego/content';
import { skillIconFile } from '@ego/render/assets';
import { skillIconSvg } from '@ego/render/svg';
import { fileResponse, notFound, svgResponse } from '@/lib/serve';

export const dynamic = 'force-dynamic';

/** Ícone de habilidade: PNG em assets/skills se existir, placeholder se não. */
export async function GET(_req: Request, { params }: { params: Promise<{ lineageId: string; skillId: string }> }) {
  const { lineageId, skillId } = await params;
  const sk = findSkill(skillId);
  if (!sk || sk.lineageId !== lineageId) return notFound();
  const file = skillIconFile(lineageId, skillId);
  if (file) return fileResponse(file, 3600);
  return svgResponse(skillIconSvg(skillId, 128), 3600);
}
