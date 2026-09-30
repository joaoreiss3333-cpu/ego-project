import type { ButtonInteraction, ChatInputCommandInteraction, RepliableInteraction, StringSelectMenuInteraction } from 'discord.js';
import { ERR, findCharacter, GameError, type Character } from '@ego/db';
import { edit, errorScreen, loadingScreen, screen, type ScreenSpec } from '../ui';

export async function ownCharacter(userId: string): Promise<Character> {
  const c = await findCharacter(userId);
  if (!c) throw ERR.noCharacter();
  return c;
}

/** Painéis de um jogador só aceitam cliques dele. */
export function assertOwner(i: { user: { id: string } }, ownerId: string) {
  if (i.user.id !== ownerId) throw new GameError('not_owner', 'Esse painel é de outro jogador. Use o comando para abrir o seu.');
}

/** Responde com uma tela de espera e depois edita com o resultado (imagens podem demorar). */
export async function replyWithLoading(i: ChatInputCommandInteraction | RepliableInteraction, message: string, build: () => Promise<ScreenSpec>, ephemeral = false) {
  await i.reply(screen(loadingScreen(message), { ephemeral }));
  try {
    const spec = await build();
    await i.editReply(edit(spec));
  } catch (e) {
    const msg = e instanceof GameError ? e.message : 'Algo deu errado do nosso lado. Tente de novo em instantes.';
    if (!(e instanceof GameError)) console.error(e);
    await i.editReply(edit(errorScreen(msg)));
  }
}

/** Troca de aba / atualização de painel: mostra espera e edita a mesma mensagem. */
export async function updateWithLoading(i: ButtonInteraction | StringSelectMenuInteraction, message: string, build: () => Promise<ScreenSpec>) {
  await i.update(edit(loadingScreen(message)));
  try {
    await i.editReply(edit(await build()));
  } catch (e) {
    const msg = e instanceof GameError ? e.message : 'Algo deu errado do nosso lado. Tente de novo em instantes.';
    if (!(e instanceof GameError)) console.error(e);
    await i.editReply(edit(errorScreen(msg)));
  }
}

export function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}
