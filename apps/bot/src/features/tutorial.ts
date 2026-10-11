import { GAME } from '@ego/content';
import { turnos } from '@ego/engine';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, row, screen, text, type ScreenSpec, type Tab } from '../ui';
import { assertOwner } from './common';

const { TURNOS } = turnos;
const P = TURNOS.pass;
const S = TURNOS.shot;

/**
 * /tutorial: as regras do jogo de turnos individuais, em páginas curtas.
 * Os números vêm de TURNOS, então o texto acompanha o balanceamento.
 */
interface Page {
  id: string;
  label: string;
  body: string;
}

const PAGES: Page[] = [
  {
    id: 'visao',
    label: 'Visão geral',
    body: [
      `### Como funciona uma partida`,
      `O campo é uma grade e **cada pessoa joga o seu próprio turno**, uma de cada vez. Os times se intercalam (A1, B1, A2, B2...) e o goleiro também joga.`,
      `No seu turno você escolhe **uma ação** e ela **acontece na hora**: o campo muda e passa a vez para a próxima pessoa. Se o tempo (${TURNOS.turnSeconds} s) acabar, você só **perde a vez**.`,
      `Nada anda na **diagonal**: movimento, desarme e drible são só para cima, baixo, esquerda e direita.`,
      `Todo duelo é **atributo + d10** de cada lado. **Maior vence. Empate estagna:** nada acontece e ninguém perde nada.`,
      `Partida: ${TURNOS.halves} tempos de ${TURNOS.roundsPerHalf} rodadas. Uma rodada é todo mundo jogar uma vez.`,
    ].join('\n'),
  },
  {
    id: 'sem',
    label: 'Sem a bola',
    body: [
      `### Sem a bola (uma ação por turno)`,
      `**Mover:** até ${TURNOS.move.noBall} casas.`,
      `**Bote:** o portador adversário precisa estar **colado** (1 casa, sem diagonal). Sua **Defesa + d10** contra o **Físico + d10** dele. Cada outro marcador colado nele soma **+${TURNOS.coverage}** (cobertura).`,
      `**Carrinho:** igual ao Bote com **+${TURNOS.carrinhoBonus}**, mas arriscado. Se você **perder**, pode ser falta (Bote ${TURNOS.foul.bote * 10}%, Carrinho ${TURNOS.foul.carrinho * 10}%) e cartão amarelo (Bote ${TURNOS.yellow.bote * 10}%, Carrinho ${TURNOS.yellow.carrinho * 10}% das faltas). **Dois amarelos expulsam.** Perdendo sem falta, você cai e não se move no próximo turno.`,
      `**Conter:** contra um adversário colado, sem tentar roubar. Sua **Defesa + d10** contra o **Físico + d10** dele. Vencendo, **tudo que ele fizer no próximo turno sofre -${TURNOS.conter.normal}** (-${TURNOS.conter.carrier} se for o portador).`,
      `A **falta** vira tiro livre: quem sofreu joga de novo na hora. Dentro da área é **pênalti**.`,
    ].join('\n'),
  },
  {
    id: 'com',
    label: 'Com a bola',
    body: [
      `### Com a bola (uma ação por turno)`,
      `**Mover:** só ${TURNOS.move.withBall} casa.`,
      `**Driblar:** um adversário colado e a casa **logo atrás dele** livre. Seu **Drible + d10** contra a **Defesa + d10** dele (mais a cobertura). Venceu: você **salta por cima** e cai atrás dele com a bola. Perdeu: ele fica com a bola.`,
      `**Passar:** quatro tipos (veja a página de passes).`,
      `**Chutar:** veja a página de chute.`,
      `Quem leva um Bote se defende com o **Físico**. Quem tem a bola perto de vários marcadores está em perigo: a cobertura soma contra você.`,
    ].join('\n'),
  },
  {
    id: 'passes',
    label: 'Passes',
    body: [
      `### Os 4 passes (cada um com uma função)`,
      `Precisão: **Passe + d10** (+ Visão ÷ ${TURNOS.visionDivisor} nos difíceis) menos a distância. Abaixo do limiar, a bola sai torta e cai solta.`,
      `**Curto:** até ${P.curto.range} casas em linha reta, limiar ${P.curto.threshold}. Quem estiver no caminho pode **cortar** (Defesa + d10 + Visão contra a sua precisão). Empate: o passe não sai.`,
      `**Longo:** até ${P.longo.range} casas, limiar ${P.longo.threshold}, **passa por cima** de todo mundo. -1 a cada ${P.longo.every} casas acima de ${P.longo.free}. Um adversário colado no receptor disputa no alto (Físico).`,
      `**Profundidade:** bola rasteira numa casa **vazia** (até ${P.profundidade.range}) à frente de um aliado, que corre até ${P.profundidade.run} casas para pegá-la. Adversários a até ${P.profundidade.run} casas disputam por **Velocidade**.`,
      `**Cruzamento:** só dos **corredores laterais** (2 linhas de cada lado) para um aliado na **grande área**. O goleiro pode sair e abafar. Livre, o aliado **cabeceia**: (Chute + Físico) ÷ 2 + d10.`,
    ].join('\n'),
  },
  {
    id: 'chute',
    label: 'Chute e goleiro',
    body: [
      `### Chute e goleiro`,
      `Você escolhe um dos **3 cantos**: cima, centro ou baixo.`,
      `**Chute + d10** menos a distância (grátis até ${S.freeDistance} casas do gol, depois -1 a cada ${S.penaltyEvery}) e -${S.markerPenalty} por marcador colado, contra a **Defesa + d10** do goleiro.`,
      `O goleiro **também escolhe um canto na hora** (${TURNOS.keeperSeconds} s). Se acertar o seu, ganha **+${S.keeperCorner}**. Variar o canto te protege de ser lido: o goleiro bot cobre o canto que você mais usou.`,
      `**Gol** se você vencer. **Empate:** o goleiro espalma e a bola sobra na frente do gol.`,
      `**Goleiro:** tem turno próprio e escolhe uma postura que vale até o próximo turno dele: **Posicionar** (anda ${TURNOS.keeper.move} casas na área), **Adiantar linha** (+${TURNOS.keeper.adiantarIntercept} para cortar passes na área, -${S.adiantarPenalty} na defesa de chutes), **Comandar** (+${TURNOS.keeper.comandar} de Defesa a um aliado na área) e **Sair do gol** (+${TURNOS.keeper.sairBonus} em cruzamentos e bolas soltas).`,
    ].join('\n'),
  },
];

const tabs = (owner: string): Tab[] => PAGES.map((p) => ({ id: p.id, label: p.label, customId: cid('tu', owner, 'page', p.id) }));

export function tutorialScreen(owner: string, pageId = PAGES[0].id): ScreenSpec {
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0];
  return {
    accent: 'padrao',
    tabs: { items: tabs(owner), current: page.id },
    blocks: [text(page.body), text(`-# ${GAME.name} · Dica: o painel do seu turno mostra a chance de cada ação antes de você confirmar.`)],
  };
}

/** Ajuda rápida do botão "Como jogar" na partida. */
export function quickHelpScreen(userId: string): ScreenSpec {
  return {
    accent: 'padrao',
    blocks: [
      text(
        [
          '### Como jogar, em 30 segundos',
          '**1.** Quando for a sua vez, clique em **Jogar meu turno**. O painel é só seu.',
          `**2.** Escolha **uma ação**: com a bola (mover, driblar, passar, chutar) ou sem ela (mover, bote, carrinho, conter).`,
          '**3.** Confira a chance de sucesso e **Confirme**. A jogada acontece na hora.',
          '**4.** Não joga a tempo? Só perde a vez.',
          '-# Duelo = atributo + d10 de cada lado; maior vence, empate não muda nada.',
        ].join('\n'),
      ),
      row(btn(cid('tu', userId, 'start'), 'Abrir o tutorial completo', ButtonStyle.Primary)),
    ],
  };
}

on.command('tutorial', async (i) => {
  await i.reply(screen(tutorialScreen(i.user.id), { ephemeral: true }));
});

on.component('tu', async (i, [owner, action, arg]) => {
  if (action === 'start') return i.reply(screen(tutorialScreen(i.user.id), { ephemeral: true }));
  assertOwner(i, owner);
  return i.update(edit(tutorialScreen(owner, action === 'page' ? arg : undefined)));
});
