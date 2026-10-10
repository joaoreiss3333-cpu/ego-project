import type { RepliableInteraction } from 'discord.js';
import { isGameError } from '@ego/db';
import { errorScreen, screen } from '../ui';

/** Mensagem de erro sem jargão: regra do jogo mostra o texto; falha interna, texto genérico. */
export function errorText(e: unknown): string {
  if (isGameError(e)) return e.message;
  return 'Algo deu errado do nosso lado. Tente de novo em instantes.';
}

/** Responde erro sempre efêmero, em container vermelho. */
export async function replyError(i: RepliableInteraction, e: unknown | string) {
  const msg = typeof e === 'string' ? e : errorText(e);
  if (typeof e !== 'string' && !isGameError(e)) console.error('[erro]', e);
  const payload = screen(errorScreen(msg), { ephemeral: true });
  try {
    if (i.deferred || i.replied) await i.followUp(payload);
    else await i.reply(payload);
  } catch (err) {
    console.error('[erro ao responder]', err);
  }
}
