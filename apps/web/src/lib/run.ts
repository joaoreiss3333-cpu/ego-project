import { isGameError, type Character } from '@ego/db';
import type { ActionState } from './action-state';
import { getViewer } from './viewer';

export const GENERIC_ERROR = 'Não deu certo agora. Tente de novo em instantes.';

export function fail<T = unknown>(message: string): ActionState<T> {
  return { ok: false, message, at: Date.now() };
}

export function done<T = unknown>(message: string, data?: T): ActionState<T> {
  return { ok: true, message, data, at: Date.now() };
}

/**
 * Executa uma ação do jogador. O personagem vem SEMPRE da sessão (nunca do formulário).
 * GameError mostra a mensagem do jogo; qualquer outro erro vira uma frase genérica.
 */
export async function withCharacter<T = unknown>(fn: (c: Character) => Promise<ActionState<T>>): Promise<ActionState<T>> {
  let character: Character | null = null;
  try {
    const v = await getViewer();
    if (!v) return fail('Sua sessão expirou. Entre de novo.');
    if (!v.character) return fail('Você ainda não tem personagem. Use /criar-personagem no Discord.');
    character = v.character;
    return await fn(character);
  } catch (e) {
    if (isGameError(e)) return fail(e.message);
    console.error('[acao]', character?.id ?? '-', e);
    return fail(GENERIC_ERROR);
  }
}
