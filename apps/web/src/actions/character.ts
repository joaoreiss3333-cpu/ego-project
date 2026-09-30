'use server';

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { revalidatePath } from 'next/cache';
import { ATTRS, ATTR_LABEL, SITE_PATHS, getTreeNode, type AttrKey } from '@ego/content';
import {
  allocateAttribute,
  buyNode,
  deleteBuild,
  profileView,
  resetAttributes,
  resetTree,
  saveBuild,
  setLoadout,
  setPortrait,
  type Build,
} from '@ego/db';
import { uploadsDir } from '@ego/render/assets';
import type { ActionState } from '@/lib/action-state';
import { MAX_PORTRAIT_BYTES, sniffImage } from '@/lib/image';
import { done, fail, withCharacter } from '@/lib/run';

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};

function parseSkills(fd: FormData): { active: string[]; flow: string } {
  const active = fd
    .getAll('active')
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, 3);
  return { active, flow: str(fd, 'flow') };
}

// ---------------------------------------------------------------------------
// Atributos
// ---------------------------------------------------------------------------

export async function allocateAttributeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const attr = str(fd, 'attr') as AttrKey;
    if (!ATTRS.includes(attr)) return fail('Atributo inválido.');
    const updated = await allocateAttribute(c.id, attr);
    revalidatePath(SITE_PATHS.atributos);
    return done(`${ATTR_LABEL[attr]} subiu para ${updated[attr]}.`);
  });
}

export async function resetAttributesAction(_prev: ActionState): Promise<ActionState> {
  return withCharacter(async (c) => {
    const updated = await resetAttributes(c.id);
    revalidatePath(SITE_PATHS.atributos);
    return done(`Atributos zerados. ${updated.attrPoints} Pontos de Atributo e as fichas gastas voltaram para você.`);
  });
}

// ---------------------------------------------------------------------------
// Árvore
// ---------------------------------------------------------------------------

export async function buyNodeAction(_prev: ActionState, fd: FormData): Promise<ActionState<{ nodeId: string }>> {
  return withCharacter(async (c) => {
    const nodeId = str(fd, 'nodeId');
    const info = getTreeNode(nodeId);
    if (!info) return fail('Nó desconhecido.');
    await buyNode(c.id, nodeId);
    revalidatePath(SITE_PATHS.linhagem);
    return done(`${info.node.name}: nó liberado.`, { nodeId });
  });
}

export async function resetTreeAction(_prev: ActionState): Promise<ActionState> {
  return withCharacter(async (c) => {
    await resetTree(c.id);
    revalidatePath(SITE_PATHS.linhagem);
    revalidatePath(SITE_PATHS.loadout);
    return done('Árvore zerada. Os Pontos de Linhagem voltaram e o loadout voltou ao padrão.');
  });
}

// ---------------------------------------------------------------------------
// Loadout e builds
// ---------------------------------------------------------------------------

export async function setLoadoutAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const { active, flow } = parseSkills(fd);
    await setLoadout(c.id, active, flow);
    revalidatePath(SITE_PATHS.loadout);
    return done('Loadout salvo. Vale a partir da próxima partida.');
  });
}

export async function saveBuildAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const { active, flow } = parseSkills(fd);
    const name = str(fd, 'name');
    await saveBuild(c.id, { name, active, flow });
    revalidatePath(SITE_PATHS.loadout);
    return done(`Build "${name.trim().slice(0, 24)}" salva.`);
  });
}

export async function applyBuildAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const name = str(fd, 'name');
    const view = await profileView(c.id);
    const build = view.builds.find((b: Build) => b.name === name);
    if (!build) return fail('Build não encontrada.');
    await setLoadout(c.id, build.active, build.flow);
    revalidatePath(SITE_PATHS.loadout);
    return done(`Build "${build.name}" aplicada.`);
  });
}

export async function deleteBuildAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const name = str(fd, 'name');
    await deleteBuild(c.id, name);
    revalidatePath(SITE_PATHS.loadout);
    return done(`Build "${name}" apagada.`);
  });
}

// ---------------------------------------------------------------------------
// Retrato
// ---------------------------------------------------------------------------

const EXTS = ['png', 'jpg', 'webp'] as const;

export async function uploadPortraitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return withCharacter(async (c) => {
    const file = fd.get('portrait');
    if (!file || typeof file === 'string' || file.size === 0) return fail('Escolha uma imagem.');
    if (file.size > MAX_PORTRAIT_BYTES) return fail('A imagem passa de 1 MB. Reduza e tente de novo.');
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength > MAX_PORTRAIT_BYTES) return fail('A imagem passa de 1 MB. Reduza e tente de novo.');
    const kind = sniffImage(buf);
    if (!kind) return fail('Formato não aceito. Envie PNG, JPEG ou WebP.');
    const dir = join(uploadsDir(), 'portraits');
    await mkdir(dir, { recursive: true });
    // remove versões antigas com outra extensão
    await Promise.all(EXTS.filter((e) => e !== kind).map((e) => unlink(join(dir, `${c.id}.${e}`)).catch(() => undefined)));
    await writeFile(join(dir, `${c.id}.${kind}`), buf);
    await setPortrait(c.id, `portraits/${c.id}.${kind}`);
    revalidatePath('/', 'layout');
    return done('Retrato atualizado.');
  });
}

export async function removePortraitAction(_prev: ActionState): Promise<ActionState> {
  return withCharacter(async (c) => {
    const dir = join(uploadsDir(), 'portraits');
    await Promise.all(EXTS.map((e) => unlink(join(dir, `${c.id}.${e}`)).catch(() => undefined)));
    await setPortrait(c.id, null);
    revalidatePath('/', 'layout');
    return done('Retrato removido. Voltou a silhueta padrão.');
  });
}
