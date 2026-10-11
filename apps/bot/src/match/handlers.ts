import { turnos } from '@ego/engine';
import { quickHelpScreen } from '../features/tutorial';
import { on } from '../router';
import { edit, screen, text } from '../ui';
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
  // ajuda rápida: qualquer um no canal pode abrir
  if (action === 'help') return i.reply(screen(quickHelpScreen(i.user.id), { ephemeral: true }));
  const r = sessionOr(i, id);
  if ('error' in r) return replyError(i, r.error!);
  const s = r.s;
  if (action === 'play') {
    if (!s.turnOf(i.user.id)) return replyError(i, 'Não é a sua vez agora. Espere o seu turno aparecer no campo.');
    return i.reply(screen(s.panel(i.user.id), { ephemeral: true }));
  }
  if (action === 'guess') {
    const spec = s.guessPanel(i.user.id);
    if (!spec) return replyError(i, 'Essa janela já fechou ou não é com você.');
    return i.reply(screen(spec, { ephemeral: true }));
  }
});

// painel do turno (mensagem só do jogador)
on.component('pl', async (i, [verb, id, arg]) => {
  const r = sessionOr(i, id);
  if ('error' in r) return replyError(i, r.error!);
  const s = r.s;
  if (!s.turnOf(i.user.id)) return replyError(i, 'Essa vez já passou. Olhe o campo atualizado.');
  const values = i.isStringSelectMenu() ? i.values : null;
  const out = s.click(i.user.id, verb, arg, values);
  if ('screen' in out) return i.update(edit(out.screen));
  await i.update(edit({ accent: 'sucesso', blocks: [text('Jogada enviada. O resultado aparece no campo.')] }));
  try {
    await s.humanAct(i.user.id, out.action);
  } catch (e) {
    const msg = e instanceof turnos.TurnosError ? e.message : 'Não deu para aplicar essa jogada. Abra o painel de novo.';
    await i.followUp(screen({ accent: 'erro', blocks: [text(msg)] }, { ephemeral: true })).catch(() => {});
  }
});

// palpite do goleiro na hora do chute
on.component('kg', async (i, [id, corner]) => {
  const r = sessionOr(i, id);
  if ('error' in r) return replyError(i, r.error!);
  const s = r.s;
  if (!s.guessPanel(i.user.id)) return replyError(i, 'A janela do palpite já fechou.');
  const c = Number(corner) as turnos.Corner;
  await i.update(edit({ accent: 'sucesso', blocks: [text(`Você escolheu cobrir o canto **${turnos.CORNER_LABEL[c].toLowerCase()}**.`)] }));
  await s.guess(i.user.id, c).catch((e) => console.error('[palpite]', e));
});
