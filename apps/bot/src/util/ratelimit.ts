import { ANTI_ABUSE } from '@ego/content';

const hits = new Map<string, number[]>();

/**
 * Limite de uso por usuário (janela deslizante). Comandos usam o limite do
 * conteúdo; cliques em botões têm um limite mais folgado.
 */
export function rateLimited(userId: string, kind: 'command' | 'component'): boolean {
  const windowMs = ANTI_ABUSE.rateLimit.windowSeconds * 1000;
  const max = kind === 'command' ? ANTI_ABUSE.rateLimit.maxCommands : ANTI_ABUSE.rateLimit.maxCommands * 4;
  const key = `${kind}:${userId}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  return false;
}
