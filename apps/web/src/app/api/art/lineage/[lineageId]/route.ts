import { findLineage } from '@ego/content';
import { lineagePortraitFile } from '@ego/render/assets';
import { lineagePortraitSvg } from '@ego/render/svg';
import { fileResponse, notFound, svgResponse } from '@/lib/serve';

export const dynamic = 'force-dynamic';

/** Retrato da linhagem: PNG em assets/lineages se existir, placeholder se não. */
export async function GET(_req: Request, { params }: { params: Promise<{ lineageId: string }> }) {
  const { lineageId } = await params;
  if (!findLineage(lineageId)) return notFound();
  const file = lineagePortraitFile(lineageId);
  if (file) return fileResponse(file, 3600);
  return svgResponse(lineagePortraitSvg(lineageId, 256), 3600);
}
