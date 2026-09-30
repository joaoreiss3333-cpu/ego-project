import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { COLORS, RARITY_COLORS, hexToInt, type Rarity } from '@ego/content';

/**
 * Cor de destaque com significado fixo:
 *  padrão = azul elétrico · raridade = cor da raridade · erro = vermelho ·
 *  aviso/tempo acabando = âmbar · sucesso/recompensa = verde.
 */
export type Accent = 'padrao' | 'erro' | 'aviso' | 'sucesso' | Rarity;

export function accentColor(a: Accent): number {
  switch (a) {
    case 'padrao':
      return hexToInt(COLORS.electric);
    case 'erro':
      return hexToInt(COLORS.alert);
    case 'aviso':
      return hexToInt(COLORS.amber);
    case 'sucesso':
      return hexToInt(COLORS.success);
    default:
      return hexToInt(RARITY_COLORS[a]);
  }
}

export type Block =
  | { t: 'text'; content: string }
  | { t: 'sep'; large?: boolean; divider?: boolean }
  | { t: 'images'; names: string[]; alt?: string }
  | { t: 'section'; content: string[]; thumbnail?: string; button?: ButtonBuilder }
  | { t: 'row'; components: ButtonBuilder[] }
  | { t: 'select'; menu: StringSelectMenuBuilder };

export interface Tab {
  id: string;
  label: string;
  customId: string;
}

export interface ScreenSpec {
  accent: Accent;
  /** Abas no topo: a atual fica destacada e desativada. */
  tabs?: { items: Tab[]; current: string };
  blocks: Block[];
  files?: AttachmentBuilder[];
}

// blocos ------------------------------------------------------------------

export const text = (content: string): Block => ({ t: 'text', content });
export const sep = (large = false, divider = true): Block => ({ t: 'sep', large, divider });
export const images = (...names: string[]): Block => ({ t: 'images', names });
export const section = (content: string[], opts: { thumbnail?: string; button?: ButtonBuilder } = {}): Block => ({ t: 'section', content, ...opts });
export const row = (...components: ButtonBuilder[]): Block => ({ t: 'row', components });
export const selectBlock = (menu: StringSelectMenuBuilder): Block => ({ t: 'select', menu });

export function btn(customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label.slice(0, 80)).setStyle(style).setDisabled(disabled);
}

export function linkBtn(url: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
}

export function select(customId: string, placeholder: string, options: { label: string; value: string; description?: string; default?: boolean }[], disabled = false): StringSelectMenuBuilder {
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder.slice(0, 150)).setDisabled(disabled);
  menu.addOptions(
    options.slice(0, 25).map((o) => {
      const b = new StringSelectMenuOptionBuilder().setLabel(o.label.slice(0, 100)).setValue(o.value.slice(0, 100));
      if (o.description) b.setDescription(o.description.slice(0, 100));
      if (o.default) b.setDefault(true);
      return b;
    }),
  );
  return menu;
}

export function file(buffer: Buffer, name: string): AttachmentBuilder {
  return new AttachmentBuilder(buffer, { name });
}

// montagem ---------------------------------------------------------------

/** Limite de componentes por mensagem (Components V2). */
export const MAX_COMPONENTS = 40;

export function countComponents(spec: ScreenSpec): number {
  let n = 1; // container
  if (spec.tabs) n += 1 + spec.tabs.items.length;
  for (const b of spec.blocks) {
    if (b.t === 'text' || b.t === 'sep') n += 1;
    else if (b.t === 'images') n += 1 + b.names.length;
    else if (b.t === 'section') n += 1 + b.content.length + (b.thumbnail || b.button ? 1 : 0);
    else if (b.t === 'row') n += 1 + b.components.length;
    else if (b.t === 'select') n += 2;
  }
  return n;
}

export function buildContainer(spec: ScreenSpec): ContainerBuilder {
  const c = new ContainerBuilder().setAccentColor(accentColor(spec.accent));
  if (spec.tabs) {
    const r = new ActionRowBuilder<ButtonBuilder>().addComponents(
      spec.tabs.items.slice(0, 5).map((t) =>
        new ButtonBuilder()
          .setCustomId(t.customId)
          .setLabel(t.label)
          .setStyle(t.id === spec.tabs!.current ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(t.id === spec.tabs!.current),
      ),
    );
    c.addActionRowComponents(r);
    if (spec.tabs.items.length > 5) {
      c.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          spec.tabs.items.slice(5, 10).map((t) =>
            new ButtonBuilder()
              .setCustomId(t.customId)
              .setLabel(t.label)
              .setStyle(t.id === spec.tabs!.current ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(t.id === spec.tabs!.current),
          ),
        ),
      );
    }
  }
  for (const b of spec.blocks) {
    switch (b.t) {
      case 'text':
        if (b.content.trim()) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(b.content.slice(0, 3900)));
        break;
      case 'sep':
        c.addSeparatorComponents(new SeparatorBuilder().setDivider(b.divider !== false).setSpacing(b.large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small));
        break;
      case 'images':
        c.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(b.names.slice(0, 10).map((n) => new MediaGalleryItemBuilder().setURL(`attachment://${n}`))),
        );
        break;
      case 'section': {
        const s = new SectionBuilder().addTextDisplayComponents(b.content.slice(0, 3).map((x) => new TextDisplayBuilder().setContent(x.slice(0, 3900))));
        if (b.thumbnail) s.setThumbnailAccessory(new ThumbnailBuilder().setURL(b.thumbnail.startsWith('http') ? b.thumbnail : `attachment://${b.thumbnail}`));
        else if (b.button) s.setButtonAccessory(b.button);
        c.addSectionComponents(s);
        break;
      }
      case 'row':
        if (b.components.length) c.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(b.components.slice(0, 5)));
        break;
      case 'select':
        c.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(b.menu));
        break;
    }
  }
  return c;
}

export interface Payload {
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
  flags?: number;
  attachments?: never[];
}

/** Mensagem nova (flag de Components V2; efêmera se pedido). */
export function screen(spec: ScreenSpec, opts: { ephemeral?: boolean } = {}): Payload & { flags: number } {
  const n = countComponents(spec);
  if (n > MAX_COMPONENTS) throw new Error(`Tela com ${n} componentes (máximo ${MAX_COMPONENTS})`);
  return {
    components: [buildContainer(spec)],
    files: spec.files ?? [],
    flags: MessageFlags.IsComponentsV2 | (opts.ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

/** Edição de mensagem existente: troca anexos antigos pelos novos. */
export function edit(spec: ScreenSpec): Payload {
  const n = countComponents(spec);
  if (n > MAX_COMPONENTS) throw new Error(`Tela com ${n} componentes (máximo ${MAX_COMPONENTS})`);
  return { components: [buildContainer(spec)], files: spec.files ?? [], attachments: [] };
}

// telas prontas -----------------------------------------------------------

export function errorScreen(message: string): ScreenSpec {
  return { accent: 'erro', blocks: [text(message)] };
}

export function loadingScreen(message = 'Processando...'): ScreenSpec {
  return { accent: 'padrao', blocks: [text(`-# ${message}`)] };
}

export function successScreen(title: string, lines: string[]): ScreenSpec {
  return { accent: 'sucesso', blocks: [text(`### ${title}`), text(lines.join('\n'))] };
}

/** Barra de progresso em texto (sem emojis). */
export function progressBar(value: number, max: number, width = 12): string {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const full = Math.round(f * width);
  return `\`${'█'.repeat(full)}${'░'.repeat(width - full)}\``;
}

export { ButtonStyle };
