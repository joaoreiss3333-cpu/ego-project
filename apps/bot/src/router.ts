import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { rateLimited } from './util/ratelimit';
import { replyError } from './util/reply';

export type CommandHandler = (i: ChatInputCommandInteraction) => Promise<unknown>;
export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;
export type ComponentHandler = (i: ComponentInteraction, args: string[]) => Promise<unknown>;
export type ModalHandler = (i: ModalSubmitInteraction, args: string[]) => Promise<unknown>;
export type AutocompleteHandler = (i: AutocompleteInteraction) => Promise<unknown>;

const commands = new Map<string, CommandHandler>();
const components = new Map<string, ComponentHandler>();
const modals = new Map<string, ModalHandler>();
const autocompletes = new Map<string, AutocompleteHandler>();

export const on = {
  command: (name: string, h: CommandHandler) => void commands.set(name, h),
  component: (prefix: string, h: ComponentHandler) => void components.set(prefix, h),
  modal: (prefix: string, h: ModalHandler) => void modals.set(prefix, h),
  autocomplete: (name: string, h: AutocompleteHandler) => void autocompletes.set(name, h),
};

/** custom_id no formato "prefixo:arg1:arg2" (máximo 100 caracteres). */
export function cid(prefix: string, ...args: (string | number)[]): string {
  const id = [prefix, ...args.map(String)].join(':');
  if (id.length > 100) throw new Error(`custom_id longo demais: ${id}`);
  return id;
}

export async function dispatch(i: Interaction) {
  try {
    if (i.isAutocomplete()) {
      await autocompletes.get(i.commandName)?.(i);
      return;
    }
    if (i.isChatInputCommand()) {
      if (rateLimited(i.user.id, 'command')) return replyError(i, 'Calma. Espere alguns segundos antes do próximo comando.');
      const h = commands.get(i.commandName);
      if (!h) return replyError(i, 'Comando desconhecido.');
      await h(i);
      return;
    }
    if (i.isButton() || i.isStringSelectMenu()) {
      if (rateLimited(i.user.id, 'component')) return replyError(i, 'Muitos cliques seguidos. Espere um pouco.');
      const [prefix, ...args] = i.customId.split(':');
      const h = components.get(prefix);
      if (!h) return replyError(i, 'Esse painel expirou. Abra o comando de novo.');
      await h(i, args);
      return;
    }
    if (i.isModalSubmit()) {
      const [prefix, ...args] = i.customId.split(':');
      const h = modals.get(prefix);
      if (!h) return replyError(i, 'Esse formulário expirou. Abra o comando de novo.');
      await h(i, args);
    }
  } catch (e) {
    if (i.isRepliable()) await replyError(i, e);
    else console.error(e);
  }
}
