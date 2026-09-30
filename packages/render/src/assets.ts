/**
 * Localização dos arquivos de arte. Se a imagem real existir, ela é usada;
 * se não, o chamador cai no placeholder gerado. Nenhuma mudança de código é
 * necessária para trocar placeholders por arte final: basta salvar o PNG.
 *
 *   assets/skills/{linhagemId}/{habilidadeId}.png
 *   assets/lineages/{linhagemId}.png
 *   {UPLOAD_DIR}/portraits/{personagemId}.{png|jpg|webp}
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let rootCache: string | null = null;

export function repoRoot(): string {
  if (process.env.EGO_ROOT) return process.env.EGO_ROOT;
  if (rootCache) return rootCache;
  const starts = [process.cwd()];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* ambiente sem import.meta.url */
  }
  for (const start of starts) {
    let dir = resolve(start);
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
        rootCache = dir;
        return dir;
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  rootCache = process.cwd();
  return rootCache;
}

export function assetsDir(): string {
  return join(repoRoot(), 'assets');
}

export function uploadsDir(): string {
  return process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR) : join(repoRoot(), 'data', 'uploads');
}

export function fontsDir(): string {
  return join(assetsDir(), 'fonts');
}

const safe = (s: string) => /^[a-z0-9_-]+$/i.test(s);

export function skillIconFile(lineageId: string, skillId: string): string | null {
  if (!safe(lineageId) || !safe(skillId)) return null;
  const p = join(assetsDir(), 'skills', lineageId, `${skillId}.png`);
  return existsSync(p) ? p : null;
}

export function lineagePortraitFile(lineageId: string): string | null {
  if (!safe(lineageId)) return null;
  const p = join(assetsDir(), 'lineages', `${lineageId}.png`);
  return existsSync(p) ? p : null;
}

/** Retrato enviado pelo jogador (caminho relativo salvo no banco). */
export function portraitFile(relPath: string | null | undefined): string | null {
  if (!relPath || relPath.includes('..')) return null;
  const p = join(uploadsDir(), relPath);
  return existsSync(p) ? p : null;
}
