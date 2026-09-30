import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { FOOT_LABEL, GAME, POSITION_LABEL, SITE_PATHS, type Foot, type Position } from '@ego/content';
import { createCharacter, findCharacter, validateCharacterInput } from '@ego/db';
import { siteLink } from '../env';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, linkBtn, row, screen, select, selectBlock, sep, text, type ScreenSpec } from '../ui';
import { replyError } from '../util/reply';

interface Draft {
  name: string;
  number: number;
  position?: Position;
  foot?: Foot;
  color?: string;
  at: number;
}

const drafts = new Map<string, Draft>();

export const TOKEN_COLORS: { label: string; value: string }[] = [
  { label: 'Azul elétrico', value: '#1F6BFF' },
  { label: 'Ciano', value: '#22C3E6' },
  { label: 'Verde', value: '#2BD67B' },
  { label: 'Âmbar', value: '#FFB020' },
  { label: 'Laranja', value: '#FF7A1A' },
  { label: 'Roxo', value: '#9B5CFF' },
  { label: 'Rosa', value: '#FF4FA3' },
  { label: 'Branco gelo', value: '#E8EDF5' },
];

function draftScreen(userId: string, d: Draft): ScreenSpec {
  const ready = !!(d.position && d.foot && d.color);
  return {
    accent: 'padrao',
    blocks: [
      text(`### Registro de candidato\n**${d.name}** · camisa **${d.number}**\n-# Escolha posição, pé dominante e a cor do seu token.`),
      sep(),
      selectBlock(select(cid('cc', 'pos', userId), 'Posição preferida', (Object.keys(POSITION_LABEL) as Position[]).map((p) => ({ label: POSITION_LABEL[p], value: p, default: d.position === p })))),
      selectBlock(select(cid('cc', 'foot', userId), 'Pé dominante', (Object.keys(FOOT_LABEL) as Foot[]).map((f) => ({ label: FOOT_LABEL[f], value: f, default: d.foot === f })))),
      selectBlock(select(cid('cc', 'color', userId), 'Cor do token', TOKEN_COLORS.map((c) => ({ label: c.label, value: c.value, description: c.value, default: d.color === c.value })))),
      row(btn(cid('cc', 'create', userId), 'Criar personagem', ButtonStyle.Success, !ready), btn(cid('cc', 'cancel', userId), 'Cancelar', ButtonStyle.Secondary)),
    ],
  };
}

on.command('criar-personagem', async (i) => {
  if (await findCharacter(i.user.id)) return replyError(i, 'Você já tem um personagem. Veja com /perfil.');
  const modal = new ModalBuilder()
    .setCustomId(cid('ccm'))
    .setTitle(`Registro · ${GAME.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Nome do personagem').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(20).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('number').setLabel('Número da camisa (1 a 99)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true),
      ),
    );
  await i.showModal(modal);
});

on.modal('ccm', async (i) => {
  const name = i.fields.getTextInputValue('name').trim();
  const number = Number(i.fields.getTextInputValue('number').trim());
  const problem = validateCharacterInput({ name, number, position: 'atacante', foot: 'direito', tokenColor: '#1F6BFF' });
  if (problem) return replyError(i, problem);
  const d: Draft = { name, number, at: Date.now() };
  drafts.set(i.user.id, d);
  await i.reply(screen(draftScreen(i.user.id, d), { ephemeral: true }));
});

on.component('cc', async (i, [action, owner]) => {
  if (i.user.id !== owner) return replyError(i, 'Esse registro é de outro jogador.');
  const d = drafts.get(owner);
  if (!d) return replyError(i, 'O registro expirou. Use /criar-personagem de novo.');
  if (action === 'cancel') {
    drafts.delete(owner);
    return i.update(edit({ accent: 'aviso', blocks: [text('Registro cancelado.')] }));
  }
  if (i.isStringSelectMenu()) {
    const v = i.values[0];
    if (action === 'pos') d.position = v as Position;
    if (action === 'foot') d.foot = v as Foot;
    if (action === 'color') d.color = v;
    return i.update(edit(draftScreen(owner, d)));
  }
  if (action === 'create') {
    if (!d.position || !d.foot || !d.color) return replyError(i, 'Escolha posição, pé e cor antes de criar.');
    const c = await createCharacter({
      discordId: owner,
      guildId: i.guildId ?? 'dm',
      discordName: i.user.username,
      name: d.name,
      number: d.number,
      position: d.position,
      foot: d.foot,
      tokenColor: d.color,
    });
    drafts.delete(owner);
    await i.update(
      edit({
        accent: 'sucesso',
        blocks: [
          text(`### Avaliação iniciada\n**${c.name}**, camisa **${c.number}**. Você agora é um candidato.\nFalta uma coisa: a sua **linhagem**. Ela define seus tetos de atributo e suas habilidades.`),
          text('-# O primeiro giro é por conta da instalação.'),
          row(btn(cid('gc', 'open', owner), 'Fazer giro gratuito', ButtonStyle.Primary), linkBtn(siteLink(SITE_PATHS.guia('primeiros-passos')), 'Primeiros passos')),
        ],
      }),
    );
  }
});
