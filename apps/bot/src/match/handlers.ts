import { on } from '../router';
import { edit, screen } from '../ui';
import { replyError } from '../util/reply';
import { sessions } from './session';

function sessionOr(i: { user: { id: string } }, id: string) {
  const s = sessions.get(id);
  if (!s) return { error: 'Essa partida já terminou.' } as const;
  if (!s.slotOfUser(i.user.id) || s.left.has(i.user.id)) return { error: 'Você não está nesta partida.' } as const;
  return { s } as const;
}

// botões da mensagem pública
on.component('mt', async (i, [action, id]) => {
  const r = sessionOr(i, id);
  if ('error' in r) return replyError(i, r.error!);
  const s = r.s;
  if (action === 'plan') {
    if (s.phase !== 'planning') return replyError(i, 'O planejamento deste lance já fechou. Olhe o campo atualizado.');
    return i.reply(screen(s.panel(i.user.id), { ephemeral: true }));
  }
  if (action === 'react') {
    if (s.phase !== 'reaction') return replyError(i, 'A janela de reação já fechou.');
    const spec = s.reactionPanel(i.user.id);
    if (!spec) return replyError(i, 'Você não tem habilidade de reação neste lance.');
    return i.reply(screen(spec, { ephemeral: true }));
  }
});

// painel efêmero de planejamento
on.component('pl', async (i, [action, id, arg]) => {
  const r = sessionOr(i, id);
  if ('error' in r) return replyError(i, r.error!);
  const s = r.s;
  if (s.phase !== 'planning') return replyError(i, 'Esse lance já foi resolvido. Olhe o campo atualizado.');
  const values = i.isStringSelectMenu() ? i.values : null;
  const spec = s.click(i.user.id, action, arg, values);
  await i.update(edit(spec));
});

// painel efêmero de reação
on.component('rx', async (i, [action, id, arg]) => {
  const r = sessionOr(i, id);
  if ('error' in r) return replyError(i, r.error!);
  const s = r.s;
  if (s.phase !== 'reaction') return replyError(i, 'A janela de reação já fechou.');
  const values = i.isStringSelectMenu() ? i.values : null;
  const spec = s.reactionClick(i.user.id, action, arg, values);
  if (!spec) return replyError(i, 'Você não tem habilidade de reação neste lance.');
  await i.update(edit(spec));
});
