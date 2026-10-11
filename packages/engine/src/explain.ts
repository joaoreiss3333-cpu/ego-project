import { ACTION_LABEL, GOAL_ZONE_LABEL, MATCH_RULES, READ_GUESS_LABEL, findSkill } from '@ego/content';
import { cheb, eq, stepPath, type Cell } from './grid';
import { zoneRadius } from './mechanics';
import { skillLabel } from './narrate';
import type { MatchEvent, MatchState, Plan, RollPart, Team, TurnResult } from './types';

/**
 * Explicação de um lance já resolvido, para quem joga entender o que
 * aconteceu e por quê. Depois da resolução as ações de todos são públicas
 * (o histórico do lance já as guarda), então aqui tudo pode aparecer.
 */
export interface TurnExplanation {
  /** O que cada jogador escolheu. */
  choices: string[];
  /** O que aconteceu, em ordem, com a conta de cada disputa. */
  story: string[];
}

const nameIn = (state: MatchState) => (id: string | null | undefined) => (id ? (state.setup.slots.find((s) => s.id === id)?.name ?? id) : 'ninguém');

/** "2 à frente, 1 acima" no sentido de ataque do time. */
export function relativeCells(team: Team, from: Cell, to: Cell): string {
  const dir = team === 'A' ? 1 : -1;
  const fwd = (to.x - from.x) * dir;
  const lat = to.y - from.y;
  const parts: string[] = [];
  if (fwd > 0) parts.push(`${fwd} à frente`);
  if (fwd < 0) parts.push(`${-fwd} atrás`);
  if (lat < 0) parts.push(`${-lat} acima`);
  if (lat > 0) parts.push(`${lat} abaixo`);
  return parts.join(', ');
}

/** "Drible 6 + dado 4 + Driblar vence Bote 2 − fôlego baixo 1". */
export function formatParts(parts: RollPart[] | undefined): string {
  if (!parts?.length) return '';
  return parts.map((p, i) => (i === 0 ? `${p.label} ${p.value}` : `${p.value < 0 ? '−' : '+'} ${p.label} ${Math.abs(p.value)}`)).join(' ');
}

const withParts = (total: number, parts?: RollPart[]) => (parts?.length ? `**${total}** (${formatParts(parts)})` : `**${total}**`);

function choiceLine(state: MatchState, id: string, plan: Plan): string {
  const n = nameIn(state);
  const p = state.players[id];
  const a = plan.action;
  let what = ACTION_LABEL[a];
  if ((a === 'passe_pe' || a === 'tabela') && plan.targetPlayer) what += ` para ${n(plan.targetPlayer)}`;
  if ((a === 'marcar' || a === 'corta_luz') && plan.targetPlayer) what += ` em ${n(plan.targetPlayer)}`;
  if (a === 'gk_comandar' && plan.targetPlayer) what += ` (${n(plan.targetPlayer)})`;
  if ((a === 'chutar' || a === 'finalizar_primeira') && plan.shotZone !== null && plan.shotZone !== undefined) what += ` no canto ${GOAL_ZONE_LABEL[plan.shotZone].toLowerCase()}`;
  if (a === 'leitura' && plan.readGuess) what += ` (apostou em ${READ_GUESS_LABEL[plan.readGuess].toLowerCase()})`;
  if (p.isKeeper && plan.keeperZone !== null && plan.keeperZone !== undefined && state.ball.holder !== id) what += `, cobrindo ${GOAL_ZONE_LABEL[plan.keeperZone].toLowerCase()}`;
  const move = relativeCells(p.team, p.pos, plan.dest);
  const extras = [plan.sprint ? 'Sprint' : null, plan.skill ? skillLabel(state, id, plan.skill) : null, plan.useFlow ? 'Flow' : null].filter(Boolean);
  return `**${n(id)}** (${p.team}${state.ball.holder === id ? ', com a bola' : ''}): ${what}${move ? ` · ${move}` : ' · ficou'}${extras.length ? ` · ${extras.join(' + ')}` : ''}`;
}

function duelReason(n: (id: string) => string, e: Extract<MatchEvent, { t: 'duel' }>): string {
  if (e.kind === 'cobertura') return `**${n(e.defender)}** fez a Cobertura do companheiro`;
  const close = e.step === 0 ? 'já estava colado nele' : 'ficou na zona dele (a 1 casa)';
  if (e.atkAction === 'driblar') return `**${n(e.attacker)}** driblou para dentro da zona de **${n(e.defender)}**`;
  if (e.defAction === 'bote') return `**${n(e.defender)}** deu Bote em **${n(e.attacker)}**, que ${close}`;
  if (e.defAction === 'conter') return `**${n(e.defender)}** esperou com Conter e **${n(e.attacker)}** ${close}`;
  return `**${n(e.attacker)}** e **${n(e.defender)}** disputaram a bola`;
}

export function explainTurn(prev: MatchState, r: TurnResult): TurnExplanation {
  const n = nameIn(prev);
  const plans = r.plans;
  const shotHappened = r.events.some((e) => e.t === 'shot');

  // escolhas: goleiro só aparece se teve a bola, levou chute ou fez algo além de se posicionar
  const choices: string[] = [];
  for (const id of prev.order) {
    const plan = plans[id];
    if (!plan) continue;
    const p = prev.players[id];
    if (p.isKeeper && prev.ball.holder !== id && !shotHappened && plan.action === 'gk_posicionar') continue;
    choices.push(choiceLine(prev, id, plan));
  }

  const pre: string[] = [];
  const ball: string[] = [];
  const blocked = new Set<string>();
  const carrier = prev.ball.holder;
  let stolen = false;
  let dueled = false;

  for (const e of r.events) {
    const out = e.t === 'pass' || e.t === 'shot' || e.t === 'goal' || e.t === 'out' || e.t === 'halftime' || e.t === 'end' ? ball : pre;
    switch (e.t) {
      case 'read':
        pre.push(
          e.correct
            ? `**${n(e.player)}** apostou em **${READ_GUESS_LABEL[e.guess].toLowerCase()}** na Leitura e acertou: +${MATCH_RULES.duel.readBonus} nos duelos e cortes deste lance.`
            : `**${n(e.player)}** apostou em **${READ_GUESS_LABEL[e.guess].toLowerCase()}** na Leitura e errou: −${MATCH_RULES.duel.readWrongInitiativePenalty} de iniciativa no próximo lance.`,
        );
        break;
      case 'skill':
        pre.push(e.success ? `**${n(e.player)}** usou **${skillLabel(prev, e.player, e.skillId)}**${e.note ? ` (${e.note})` : ''}.` : `**${n(e.player)}** tentou **${findSkill(e.skillId)?.name ?? e.skillId}**, mas não valeu${e.note ? `: ${e.note}` : ''}.`);
        break;
      case 'flow':
        pre.push(`**${n(e.player)}** entrou em Flow: **${skillLabel(prev, e.player, e.skillId)}**.`);
        break;
      case 'duel': {
        dueled = true;
        const when = e.step === 0 ? 'Antes de andar' : `Passo ${e.step}`;
        const score = `**${n(e.attacker)}** ${withParts(e.atk, e.atkParts)} × ${withParts(e.def, e.defParts)} **${n(e.defender)}**`;
        let end: string;
        if (e.winner === 'atk') end = `**${n(e.attacker)}** venceu e seguiu com a bola.${e.defAction === 'bote' ? ` Quem perde o Bote fica **vendido** e não anda no próximo lance.` : ''}`;
        else {
          stolen = true;
          end = e.atk === e.def ? `Empate é da defesa: **${n(e.defender)}** tomou a bola.` : `**${n(e.defender)}** venceu e tomou a bola.`;
        }
        pre.push(`${when} · **Duelo:** ${duelReason(n, e)}. ${score}. ${end}`);
        break;
      }
      case 'blocked':
        if (!blocked.has(e.player)) {
          blocked.add(e.player);
          pre.push(`**${n(e.player)}** travou: a casa seguinte estava ocupada e ninguém divide casa.`);
        }
        break;
      case 'pickup':
        pre.push(`**${n(e.player)}** pisou na casa da bola solta e ficou com ela.`);
        break;
      case 'pass': {
        const what = e.kind === 'tabela' ? 'Tabela' : e.kind === 'espaco' ? 'Passe no espaço' : 'Passe';
        const roll = withParts(e.roll, e.parts);
        if (e.result === 'ok') out.push(`**${what}** de **${n(e.from)}** para **${n(e.to)}**: ${roll}. Chegou.`);
        else if (e.result === 'intercepted')
          out.push(`**${what}** de **${n(e.from)}** cortado por **${n(e.by)}**: ${withParts(e.interceptRoll ?? 0, e.interceptParts)} contra ${roll} do passe. Quem tem a zona na linha do passe pode cortar; empate é de quem corta.`);
        else if (e.result === 'astray') out.push(`**${what}** de **${n(e.from)}** saiu torto: ${roll}, abaixo de ${MATCH_RULES.pass.astrayThreshold}. A bola desviou${e.by ? ` e ficou com **${n(e.by)}**` : ' e ficou solta'}.`);
        else if (e.result === 'loose') out.push(`**${what}** de **${n(e.from)}**: a bola caiu na casa, mas nenhum companheiro estava nela ou ao lado. Ficou solta.`);
        else out.push(`**${what}** de **${n(e.from)}** saiu do campo (${roll}). A bola foi para o adversário.`);
        break;
      }
      case 'shot': {
        const roll = withParts(e.roll, e.parts);
        if (e.blockedBy) out.push(`**Chute** de **${n(e.shooter)}**: ${roll}. **${n(e.blockedBy)}** se jogou na frente e bloqueou: ${withParts(e.keeperRoll, e.keeperParts)}.`);
        else if (!e.keeper) out.push(`**Chute** de **${n(e.shooter)}**: ${roll}. Sem goleiro. **Gol!**`);
        else {
          const cover = e.keeperZone === null ? '' : e.keeperZone === e.zone ? ` O goleiro **acertou o canto**.` : ` O goleiro cobria **${GOAL_ZONE_LABEL[e.keeperZone].toLowerCase()}**.`;
          out.push(`**Chute** de **${n(e.shooter)}** no canto **${GOAL_ZONE_LABEL[e.zone].toLowerCase()}**: ${roll} × ${withParts(e.keeperRoll, e.keeperParts)} de **${n(e.keeper)}**.${cover} ${e.goal ? '**Gol!** O chute precisa passar do goleiro.' : '**Defendeu.** Empate é do goleiro.'}`);
        }
        break;
      }
      case 'goal':
        if (e.assist) out.push(`Assistência de **${n(e.assist)}**.`);
        break;
      case 'halftime':
        out.push('Fim do primeiro tempo. O segundo começa com a bola do time B.');
        break;
      case 'end':
        out.push('Fim de partida.');
        break;
      default:
        break;
    }
  }

  // portador que conduziu e parou antes do destino: foi a borda da zona de alguém
  if (carrier && !stolen && plans[carrier]?.action === 'conduzir' && !blocked.has(carrier)) {
    const cp = prev.players[carrier];
    const planned = stepPath(cp.pos, plans[carrier].dest);
    const walked = r.paths[carrier]?.length ?? 0;
    const beforeBall = r.frames[Math.max(0, r.frames.length - 2)];
    if (walked < planned.length && beforeBall) {
      const next = planned[walked];
      const who = prev.order.find((id) => {
        const o = prev.players[id];
        const pos = beforeBall.positions[id] ?? o.pos;
        return o.team !== cp.team && !o.isKeeper && cheb(pos, next) <= Math.max(1, zoneRadius(prev, id));
      });
      if (who) pre.push(`**${n(carrier)}** parou na borda da zona de **${n(who)}**: Conduzir não entra na zona do adversário. Para entrar, é Driblar (e vira duelo).`);
    }
  }

  // defensor colado no portador sem disputar: a dúvida mais comum
  if (carrier && !dueled) {
    const beforeBall = r.frames[Math.max(0, r.frames.length - 2)];
    const cpos = beforeBall?.positions[carrier] ?? prev.players[carrier].pos;
    for (const id of prev.order) {
      const o = prev.players[id];
      if (o.team === prev.players[carrier].team || o.isKeeper) continue;
      const pos = beforeBall?.positions[id] ?? o.pos;
      if (cheb(pos, cpos) > 1 || eq(pos, cpos)) continue;
      const act = plans[id]?.action;
      if (act === 'bote' || act === 'conter') continue;
      pre.push(`**${n(id)}** chegou colado em **${n(carrier)}**, mas com **${act ? ACTION_LABEL[act] : 'essa ação'}** não disputa a bola. Só há duelo com Bote, Conter ou quando o portador dribla.`);
      break;
    }
  }

  const story = [...pre, ...ball];
  if (!story.length) story.push('Ninguém disputou a bola: todos só se reposicionaram.');
  return { choices, story };
}

/** Legendas curtas do GIF: uma por passo de movimento e uma para a ação de bola. */
export function turnCaptions(prev: MatchState, r: TurnResult): { byStep: Record<number, string>; ball: string | null } {
  const n = (id: string | null | undefined) => nameIn(prev)(id).toLocaleUpperCase('pt-BR');
  const up = (s: string) => s.toLocaleUpperCase('pt-BR');
  const byStep: Record<number, string[]> = {};
  const put = (step: number, s: string) => (byStep[step] ??= []).push(s);
  let ball: string | null = null;
  for (const e of r.events) {
    if (e.t === 'duel') {
      const a = `${n(e.attacker)}${e.atkAction ? ` (${up(ACTION_LABEL[e.atkAction])})` : ''}`;
      const d = `${n(e.defender)}${e.defAction ? ` (${up(ACTION_LABEL[e.defAction])})` : ''}`;
      put(e.step, `DUELO: ${a} ${e.atk} x ${e.def} ${d} · ${e.winner === 'atk' ? `${n(e.attacker)} PASSA` : `${n(e.defender)} TOMA A BOLA`}`);
    } else if (e.t === 'pickup') {
      const step = r.frames.findIndex((f) => f.holder === e.player);
      put(Math.max(1, step), `${n(e.player)} PEGA A BOLA SOLTA`);
    } else if (e.t === 'pass' && !ball) {
      const what = e.kind === 'tabela' ? 'TABELA' : 'PASSE';
      ball =
        e.result === 'ok'
          ? `${what} DE ${n(e.from)} PARA ${n(e.to)} · CHEGOU (${e.roll})`
          : e.result === 'intercepted'
            ? `${what} DE ${n(e.from)} · CORTADO POR ${n(e.by)} (${e.interceptRoll ?? '?'} x ${e.roll})`
            : e.result === 'astray'
              ? `${what} DE ${n(e.from)} · SAIU TORTO (${e.roll})`
              : e.result === 'loose'
                ? `${what} DE ${n(e.from)} · NINGUÉM RECEBEU`
                : `${what} DE ${n(e.from)} · SAIU DO CAMPO`;
    } else if (e.t === 'shot') {
      ball = e.blockedBy
        ? `CHUTE DE ${n(e.shooter)} · BLOQUEADO POR ${n(e.blockedBy)}`
        : `CHUTE DE ${n(e.shooter)} ${e.roll} x ${e.keeperRoll > -99 ? e.keeperRoll : '-'} GOLEIRO · ${e.goal ? 'GOL' : 'DEFENDEU'}`;
    }
  }
  return { byStep: Object.fromEntries(Object.entries(byStep).map(([k, v]) => [k, v.join('  |  ')])), ball };
}
