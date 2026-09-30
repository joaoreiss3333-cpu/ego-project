import type { CosmeticDef } from '@ego/content';
import { frameSvg, sparkTrailSvg, titlePlateSvg } from '@ego/render/svg';
import { svgUri } from '@/lib/art';

/** Prévia do cosmético com a mesma arte usada no card e no campo. */
export function CosmeticPreview({ def }: { def: CosmeticDef }) {
  if (def.type === 'moldura') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cos__frame" src={svgUri(frameSvg(def.id, 200, 280))} alt="" width={100} height={140} />;
  }
  if (def.type === 'titulo') return <div className="cos__svg" dangerouslySetInnerHTML={{ __html: titlePlateSvg(def.name, 220, 44) }} />;
  return <div className="cos__svg cos__svg--trail" dangerouslySetInnerHTML={{ __html: sparkTrailSvg(240, 60) }} />;
}
