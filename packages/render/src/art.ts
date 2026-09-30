import { loadImage, type Image } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { findSkill } from '@ego/content';
import { lineagePortraitFile, portraitFile, skillIconFile } from './assets';
import { ensureFonts } from './draw';
import { lineagePortraitSvg, playerSilhouetteSvg, skillIconSvg } from './svg';

const cache = new Map<string, Image>();

async function fromSvg(key: string, svg: string): Promise<Image> {
  ensureFonts();
  const hit = cache.get(key);
  if (hit) return hit;
  const img = await loadImage(Buffer.from(svg));
  cache.set(key, img);
  return img;
}

async function fromFile(path: string): Promise<Image> {
  return loadImage(await readFile(path));
}

/** Ícone da habilidade: arte real em assets/skills/{linhagem}/{habilidade}.png ou placeholder. */
export async function skillIcon(skillId: string, size = 128): Promise<Image> {
  const sk = findSkill(skillId);
  const file = sk ? skillIconFile(sk.lineageId, skillId) : null;
  if (file) return fromFile(file);
  return fromSvg(`skill:${skillId}:${size}`, skillIconSvg(skillId, size));
}

/** Retrato da linhagem: assets/lineages/{id}.png ou placeholder. */
export async function lineagePortrait(lineageId: string, size = 256): Promise<Image> {
  const file = lineagePortraitFile(lineageId);
  if (file) return fromFile(file);
  return fromSvg(`lineage:${lineageId}:${size}`, lineagePortraitSvg(lineageId, size));
}

/** Retrato do jogador: upload próprio ou silhueta na cor do token. */
export async function playerPortrait(relPath: string | null | undefined, color: string, number?: number, size = 256): Promise<Image> {
  const file = portraitFile(relPath);
  if (file) {
    try {
      return await fromFile(file);
    } catch {
      /* arquivo inválido: cai na silhueta */
    }
  }
  return fromSvg(`sil:${color}:${number}:${size}`, playerSilhouetteSvg(color, number, size));
}

export async function svgImage(svg: string, key?: string): Promise<Image> {
  return key ? fromSvg(key, svg) : (ensureFonts(), loadImage(Buffer.from(svg)));
}
