import type { AttrKey } from '@ego/content';
import { turnos, type Cell } from '@ego/engine';
import { renderTurnosField } from '@ego/render';
import { cid } from '../router';
import { ButtonStyle, btn, file, images, row, select, selectBlock, sep, text, type Block, type ScreenSpec } from '../ui';

const { TURNOS, CORNER_LABEL, PASS_LABEL, POSTURE_LABEL, legalActions, nameOf, winChance } = turnos;
type TState = turnos.TState;
type Action = turnos.Action;
type PassType = turnos.PassType;
type Corner = turnos.Corner;

/**
 * Painel do turno (mensagem só do jogador). Cada clique leva a uma etapa e
 * nada acontece no jogo até o botão Confirmar.
 */
export type Step =
  | { s: 'menu' }
  | { s: 'move' }
  | { s: 'driblar' }
  | { s: 'conter' }
  | { s: 'pass' }
  | { s: 'passTo'; type: PassType }
  | { s: 'shot' }
  | { s: 'keeperDest'; posture: 'posicionar' | 'sair' }
  | { s: 'keeperAlly' }
  | { s: 'confirm'; action: Action; marked?: Cell };

export interface Draft {
  step: Step;
}

export const newDraft = (): Draft => ({ step: { s: 'menu' } });

const cellKey = (c: Cell) => `${c.x},${c.y}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const att = (s: TState, id: string, k: AttrKey) => turnos.slot(s, id).attrs[k];

/** Texto curto do que a ação faz, com a chance de sucesso quando há duelo. */
export function describe(s: TState, actorId: string, a: Action): string {
  const nm = (id: string) => nameOf(s, id);
  const p = s.players[actorId];
  switch (a.kind) {
    case 'passar':
      return 'Perder a vez';
    case 'mover':
      return `Mover para (${a.dest.x}, ${a.dest.y})`;
    case 'bote':
    case 'carrinho': {
      const h = s.ball.holder!;
      const others = turnos.playersOn(s).filter((o) => o.team !== s.players[h].team && o.id !== actorId && !o.isKeeper && turnos.manh(o.pos, s.players[h].pos) === 1).length;
      const mine = att(s, actorId, 'defesa') + others + (a.kind === 'carrinho' ? TURNOS.carrinhoBonus : 0) - p.conter;
      const win = winChance(mine, att(s, h, 'fisico'));
      const risk = a.kind === 'carrinho' ? `Se perder: ${pct(TURNOS.foul.carrinho / 10)} de falta (amarelo em ${pct(TURNOS.yellow.carrinho / 10)} das faltas); sem falta você cai e perde o próximo movimento.` : `Se perder: ${pct(TURNOS.foul.bote / 10)} de falta.`;
      return `${a.kind === 'bote' ? 'Bote' : 'Carrinho'} em ${nm(h)}\nSua Defesa ${mine} (com cobertura${a.kind === 'carrinho' ? ' e +3' : ''}) contra o Físico ${att(s, h, 'fisico')} dele: chance de roubar ≈ **${pct(win)}**. Empate: nada acontece.\n${risk}`;
    }
    case 'conter': {
      const win = winChance(att(s, actorId, 'defesa') - p.conter, att(s, a.target, 'fisico'));
      return `Conter ${nm(a.target)}\nSe vencer (≈ **${pct(win)}**), tudo que ele fizer no próximo turno sofre -${s.ball.holder === a.target ? TURNOS.conter.carrier : TURNOS.conter.normal}. Não rouba a bola.`;
    }
    case 'driblar': {
      const cov = turnos.playersOn(s).filter((o) => o.team !== p.team && o.id !== a.target && !o.isKeeper && turnos.manh(o.pos, p.pos) === 1).length;
      const win = winChance(att(s, actorId, 'drible') - p.conter, att(s, a.target, 'defesa') + cov);
      return `Driblar ${nm(a.target)}\nSeu Drible ${att(s, actorId, 'drible') - p.conter} contra a Defesa ${att(s, a.target, 'defesa') + cov} dele: chance de passar ≈ **${pct(win)}**. Perdendo, ele fica com a bola. Empate: nada acontece.`;
    }
    case 'passe': {
      const L = legalActions(s, actorId).passes[a.type].find((o) => o.to.x === a.to.x && o.to.y === a.to.y && (a.type !== 'profundidade' || o.receiver === a.runner));
      const who = L ? nm(L.receiver) : '?';
      const T = TURNOS.pass[a.type];
      const dist = L?.dist ?? 0;
      const pen = a.type === 'longo' || a.type === 'profundidade' ? Math.max(0, Math.ceil((dist - TURNOS.pass[a.type].free) / TURNOS.pass[a.type].every)) : 0;
      const vis = a.type === 'curto' ? 0 : Math.floor(att(s, actorId, 'visao') / TURNOS.visionDivisor);
      const need = T.threshold - (att(s, actorId, 'passe') + vis - pen - p.conter);
      const ok = need <= 1 ? 1 : need > 10 ? 0 : (11 - need) / 10;
      return `${PASS_LABEL[a.type]} ${a.type === 'profundidade' ? `para ${who} correr` : `para ${who}`} (${dist} casas)\nPrecisão: Passe ${att(s, actorId, 'passe')}${vis ? ` + Visão ${vis}` : ''}${pen ? ` - distância ${pen}` : ''} + dado, precisa de ${T.threshold}: chance de sair certo ≈ **${pct(ok)}**.${a.type === 'curto' || a.type === 'profundidade' ? ' Adversário no caminho pode cortar.' : ''}`;
    }
    case 'chutar': {
      return `Chutar no canto ${CORNER_LABEL[a.corner].toLowerCase()}\nO goleiro também escolhe um canto: se acertar o seu, ganha +${TURNOS.shot.keeperCorner}. Variar o canto é o que te protege de ser lido.`;
    }
    case 'goleiro':
      return `${POSTURE_LABEL[a.posture]}${a.ally ? ` (${nm(a.ally)})` : ''}`;
  }
}

function numbered(cells: Cell[]): Cell[] {
  return cells.slice(0, 25);
}

function board(s: TState, actorId: string, o: { numbered?: Cell[]; marked?: Cell | null } = {}): ScreenSpec['files'] {
  return [file(renderTurnosField(s, { actor: actorId, numbered: o.numbered, marked: o.marked ?? null, hudRight: 'SEU TURNO' }), 'painel.png')];
}

const back = (id: string) => btn(cid('pl', 'menu', id), 'Voltar', ButtonStyle.Secondary);

export function panelScreen(args: { matchId: string; state: TState; actorId: string; draft: Draft; deadline: number }): ScreenSpec {
  const { matchId: id, state: s, actorId, draft } = args;
  const L = legalActions(s, actorId);
  const p = s.players[actorId];
  const closes = `<t:${Math.floor(args.deadline / 1000)}:R>`;
  const head = `### Seu turno · fecha ${closes}`;
  const st = draft.step;
  const hasBall = s.ball.holder === actorId;

  if (st.s === 'menu') {
    const lines: string[] = [head];
    if (L.mode === 'penalti') lines.push('**Pênalti.** Escolha o canto do chute.');
    else if (L.mode === 'falta') lines.push('**Tiro livre.** Chute direto (a penalidade cresce com a distância) ou passe.');
    else if (p.isKeeper) lines.push(hasBall ? 'Você está com a bola. Reponha com um passe ou ajuste a postura.' : 'Escolha a postura do goleiro. Ela vale até o seu próximo turno.');
    else if (hasBall) lines.push('Você está com a bola. Uma ação por turno.');
    else lines.push(L.bote ? 'O portador adversário está colado em você.' : 'Você está sem a bola. Uma ação por turno.');
    if (p.conter) lines.push(`-# Você está pressionado: -${p.conter} em tudo que fizer neste turno.`);
    if (p.fallen) lines.push('-# Você caiu no carrinho: não pode se mover neste turno.');
    const any = (n: number) => n > 0;
    const row1: ReturnType<typeof btn>[] = [];
    if (L.mode !== 'normal') {
      row1.push(btn(cid('pl', 'sh', id), 'Chutar', ButtonStyle.Primary, !L.chutar));
      if (L.mode === 'falta') row1.push(btn(cid('pl', 'ps', id), 'Passar', ButtonStyle.Primary, !Object.values(L.passes).some((x) => x.length)));
    } else if (p.isKeeper) {
      for (const g of L.goleiro) row1.push(btn(cid('pl', 'gk', id, g.posture), POSTURE_LABEL[g.posture], ButtonStyle.Secondary, g.posture === 'comandar' && !g.allies?.length));
    } else if (hasBall) {
      row1.push(btn(cid('pl', 'mv', id), 'Mover', ButtonStyle.Secondary, !any(L.move.length)));
      row1.push(btn(cid('pl', 'dr', id), 'Driblar', ButtonStyle.Secondary, !any(L.driblar.length)));
      row1.push(btn(cid('pl', 'ps', id), 'Passar', ButtonStyle.Secondary, !Object.values(L.passes).some((x) => x.length)));
      row1.push(btn(cid('pl', 'sh', id), 'Chutar', ButtonStyle.Primary, !L.chutar));
    } else {
      row1.push(btn(cid('pl', 'mv', id), 'Mover', ButtonStyle.Secondary, !any(L.move.length)));
      row1.push(btn(cid('pl', 'bote', id), 'Bote', ButtonStyle.Secondary, !L.bote));
      row1.push(btn(cid('pl', 'carr', id), 'Carrinho', ButtonStyle.Secondary, !L.carrinho));
      row1.push(btn(cid('pl', 'cn', id), 'Conter', ButtonStyle.Secondary, !any(L.conter.length)));
    }
    const row2 = [];
    if (p.isKeeper && hasBall && L.mode === 'normal') {
      row2.push(btn(cid('pl', 'mv', id), 'Mover', ButtonStyle.Secondary, !any(L.move.length)));
      row2.push(btn(cid('pl', 'ps', id), 'Passar', ButtonStyle.Primary, !Object.values(L.passes).some((x) => x.length)));
    }
    if (L.mode === 'normal') row2.push(btn(cid('pl', 'skip', id), 'Perder a vez', ButtonStyle.Danger));
    const blocks: Block[] = [text(lines.join('\n')), images('painel.png'), row(...row1)];
    if (row2.length) blocks.push(row(...row2));
    return { accent: 'padrao', files: board(s, actorId), blocks };
  }

  if (st.s === 'move' || st.s === 'keeperDest') {
    const cells = numbered(st.s === 'move' ? L.move : (L.goleiro.find((g) => g.posture === st.posture)?.dests ?? []));
    const opts = cells.map((c, i) => ({ label: `${i + 1} · casa (${c.x}, ${c.y})`, value: cellKey(c) }));
    return {
      accent: 'padrao',
      files: board(s, actorId, { numbered: cells }),
      blocks: [text(`${head}\n**${st.s === 'move' ? 'Mover' : POSTURE_LABEL[st.posture]}:** escolha a casa pelo número da imagem.`), images('painel.png'), selectBlock(select(cid('pl', 'pick', id), 'Casa de destino', opts)), row(back(id))],
    };
  }

  if (st.s === 'driblar' || st.s === 'conter' || st.s === 'keeperAlly') {
    const items =
      st.s === 'driblar'
        ? L.driblar.map((d) => ({ label: `Driblar ${nameOf(s, d.target)}`, value: d.target }))
        : st.s === 'conter'
          ? L.conter.map((t) => ({ label: `Conter ${nameOf(s, t)}`, value: t }))
          : (L.goleiro.find((g) => g.posture === 'comandar')?.allies ?? []).map((t) => ({ label: `Comandar ${nameOf(s, t)}`, value: t }));
    return {
      accent: 'padrao',
      files: board(s, actorId),
      blocks: [text(`${head}\nEscolha o alvo.`), images('painel.png'), selectBlock(select(cid('pl', 'pick', id), 'Alvo', items)), row(back(id))],
    };
  }

  if (st.s === 'pass') {
    const types: PassType[] = ['curto', 'longo', 'profundidade', 'cruzamento'];
    const help = [
      '**Curto:** até 3 casas em linha reta. Quem estiver no caminho pode cortar.',
      '**Longo:** até 7 casas, por cima de todo mundo. Precisa de Passe bom para chegar.',
      '**Profundidade:** bola numa casa vazia à frente de um aliado, que corre até ela.',
      '**Cruzamento:** só dos corredores laterais para a área; vira cabeceio.',
    ];
    return {
      accent: 'padrao',
      files: board(s, actorId),
      blocks: [text(`${head}\n**Passar:** escolha o tipo.\n${help.map((h) => `-# ${h}`).join('\n')}`), images('painel.png'), row(...types.map((t) => btn(cid('pl', 'pt', id, t), PASS_LABEL[t], ButtonStyle.Secondary, !L.passes[t].length))), row(back(id))],
    };
  }

  if (st.s === 'passTo') {
    // uma opção por casa de destino, a mais perto de quem corre/recebe primeiro
    const seen = new Set<string>();
    const opts = L.passes[st.type]
      .filter((o) => (seen.has(cellKey(o.to)) ? false : (seen.add(cellKey(o.to)), true)))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 25);
    const cells = opts.map((o) => o.to);
    const items = opts.map((o, i) => ({
      label: `${i + 1} · ${nameOf(s, o.receiver)}${st.type === 'profundidade' ? ' corre' : ''} (${o.dist} casas)`,
      value: `${o.to.x},${o.to.y},${o.receiver}`,
    }));
    return {
      accent: 'padrao',
      files: board(s, actorId, { numbered: cells }),
      blocks: [text(`${head}\n**${PASS_LABEL[st.type]}:** escolha o destino pelo número.`), images('painel.png'), selectBlock(select(cid('pl', 'pick', id), 'Destino do passe', items)), row(btn(cid('pl', 'ps', id), 'Voltar', ButtonStyle.Secondary))],
    };
  }

  if (st.s === 'shot') {
    const dist = turnos.goalDistance(s, p.team, p.pos);
    const distPen = dist > TURNOS.shot.freeDistance ? Math.ceil((dist - TURNOS.shot.freeDistance) / TURNOS.shot.penaltyEvery) : 0;
    const marks = L.mode === 'normal' ? turnos.playersOn(s).filter((o) => o.team !== p.team && !o.isKeeper && turnos.manh(o.pos, p.pos) === 1).length * TURNOS.shot.markerPenalty : 0;
    const calc = L.mode === 'penalti' ? `Chute ${att(s, actorId, 'chute')} + dado (pênalti: sem penalidade)` : `Chute ${att(s, actorId, 'chute')} + dado - distância ${distPen} (${dist} casas)${L.mode === 'normal' && marks ? ` - marcadores ${marks}` : ''}`;
    return {
      accent: 'padrao',
      files: board(s, actorId),
      blocks: [text(`${head}\n**Chutar:** escolha o canto do gol.\n-# ${calc}. O goleiro também escolhe um canto na hora do chute: se ele acertar o seu, ganha +${TURNOS.shot.keeperCorner}.`), images('painel.png'), row(...([0, 1, 2] as Corner[]).map((c) => btn(cid('pl', 'cr', id, c), CORNER_LABEL[c], ButtonStyle.Primary))), row(back(id))],
    };
  }

  // confirmar
  return {
    accent: 'aviso',
    files: board(s, actorId, { marked: st.marked ?? null }),
    blocks: [text(`${head}\n${describe(s, actorId, st.action)}`), images('painel.png'), sep(), row(btn(cid('pl', 'ok', id), 'Confirmar', ButtonStyle.Success), back(id))],
  };
}

export type ClickResult = { kind: 'screen' } | { kind: 'act'; action: Action };

/** Aplica um clique no painel. Devolve a ação quando o jogador confirmou. */
export function applyClick(state: TState, actorId: string, draft: Draft, verb: string, arg: string | undefined, values: string[] | null): ClickResult {
  const L = legalActions(state, actorId);
  const go = (step: Step): ClickResult => {
    draft.step = step;
    return { kind: 'screen' };
  };
  const confirm = (action: Action, marked?: Cell) => go({ s: 'confirm', action, marked });
  const v = values?.[0];
  switch (verb) {
    case 'menu':
      return go({ s: 'menu' });
    case 'mv':
      return go({ s: 'move' });
    case 'dr':
      return L.driblar.length === 1 ? confirm({ kind: 'driblar', target: L.driblar[0].target }) : go({ s: 'driblar' });
    case 'cn':
      return L.conter.length === 1 ? confirm({ kind: 'conter', target: L.conter[0] }) : go({ s: 'conter' });
    case 'ps':
      return go({ s: 'pass' });
    case 'pt':
      return go({ s: 'passTo', type: arg as PassType });
    case 'sh':
      return go({ s: 'shot' });
    case 'cr':
      return confirm({ kind: 'chutar', corner: Number(arg) as Corner });
    case 'bote':
      return confirm({ kind: 'bote' });
    case 'carr':
      return confirm({ kind: 'carrinho' });
    case 'skip':
      return confirm({ kind: 'passar' });
    case 'gk': {
      const posture = arg as 'posicionar' | 'adiantar' | 'comandar' | 'sair';
      if (posture === 'posicionar' || posture === 'sair') return go({ s: 'keeperDest', posture });
      if (posture === 'comandar') return go({ s: 'keeperAlly' });
      return confirm({ kind: 'goleiro', posture });
    }
    case 'pick': {
      const st = draft.step;
      if (!v) return { kind: 'screen' };
      if (st.s === 'move') {
        const [x, y] = v.split(',').map(Number);
        return confirm({ kind: 'mover', dest: { x, y } }, { x, y });
      }
      if (st.s === 'keeperDest') {
        const [x, y] = v.split(',').map(Number);
        return confirm({ kind: 'goleiro', posture: st.posture, dest: { x, y } }, { x, y });
      }
      if (st.s === 'driblar') return confirm({ kind: 'driblar', target: v });
      if (st.s === 'conter') return confirm({ kind: 'conter', target: v });
      if (st.s === 'keeperAlly') return confirm({ kind: 'goleiro', posture: 'comandar', ally: v });
      if (st.s === 'passTo') {
        const [x, y, who] = v.split(',');
        const to = { x: Number(x), y: Number(y) };
        return confirm({ kind: 'passe', type: st.type, to, runner: st.type === 'profundidade' ? who : undefined }, to);
      }
      return { kind: 'screen' };
    }
    case 'ok': {
      const st = draft.step;
      if (st.s !== 'confirm') return { kind: 'screen' };
      return { kind: 'act', action: st.action };
    }
  }
  return { kind: 'screen' };
}

/** Painel do goleiro na hora do chute: escolher o canto que vai cobrir. */
export function guessScreen(args: { matchId: string; state: TState; shooterId: string; keeperId: string; deadline: number }): ScreenSpec {
  const { matchId: id, state: s } = args;
  const closes = `<t:${Math.floor(args.deadline / 1000)}:R>`;
  const file1 = [file(renderTurnosField(s, { actor: args.shooterId, hudRight: 'CHUTE' }), 'painel.png')];
  return {
    accent: 'aviso',
    files: file1,
    blocks: [
      text(`### Goleiro: escolha o canto · fecha ${closes}\n**${nameOf(s, args.shooterId)}** vai finalizar. Acertando o canto, você ganha **+${TURNOS.shot.keeperCorner}** na defesa. Se o tempo acabar, você não adivinha.`),
      images('painel.png'),
      row(...([0, 1, 2] as Corner[]).map((c) => btn(cid('kg', id, c), `Cobrir ${CORNER_LABEL[c].toLowerCase()}`, ButtonStyle.Primary))),
    ],
  };
}
