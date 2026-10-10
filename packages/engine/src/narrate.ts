import { MASTERY, READ_GUESS_LABEL, findSkill, masteryLevel } from '@ego/content';
import type { MatchEvent, MatchState, PlanMap } from './types';

function nameOf(state: MatchState, id: string | null | undefined): string {
  if (!id) return 'ninguém';
  return state.setup.slots.find((s) => s.id === id)?.name ?? id;
}

export function skillLabel(state: MatchState, playerId: string, skillId: string): string {
  const def = findSkill(skillId);
  if (!def) return skillId;
  const slot = state.setup.slots.find((s) => s.id === playerId);
  const lvl = masteryLevel(slot?.mastery[skillId] ?? 0);
  return lvl >= MASTERY.suffixLevel ? `${def.name} ${MASTERY.suffix}` : def.name;
}

function pick(variants: string[], seed: number): string {
  return variants[Math.abs(seed) % variants.length];
}

/** 1 a 3 linhas curtas descrevendo o lance. */
export function narrate(state: MatchState, events: MatchEvent[], _plans: PlanMap): string[] {
  const n = (id: string | null | undefined) => nameOf(state, id);
  const seed = state.turn * 7 + events.length;
  const lines: { p: number; text: string }[] = [];

  const dribblesWon: Record<string, number> = {};
  for (const e of events) if (e.t === 'duel' && e.kind === 'drible' && e.winner === 'atk') dribblesWon[e.attacker] = (dribblesWon[e.attacker] ?? 0) + 1;

  for (const e of events) {
    switch (e.t) {
      case 'goal': {
        const assist = e.assist ? ` Assistência de ${n(e.assist)}.` : '';
        const txt = e.oneTouch
          ? pick([`${n(e.scorer)} bateu de primeira e balançou a rede.`, `De primeira. ${n(e.scorer)} não deixou a bola quicar.`], seed)
          : pick([`GOL. ${n(e.scorer)} finalizou e não deu chance.`, `${n(e.scorer)} encontrou o canto. Gol.`, `Rede. ${n(e.scorer)} decidiu.`], seed);
        lines.push({ p: 100, text: txt + assist });
        break;
      }
      case 'save':
        lines.push({ p: 80, text: pick([`${n(e.keeper)} espalmou o chute de ${n(e.shooter)}.`, `Defesa de ${n(e.keeper)}. ${n(e.shooter)} parou nele.`], seed) });
        break;
      case 'block':
        lines.push({ p: 82, text: `${n(e.blocker)} esticou o corpo inteiro e bloqueou ${n(e.shooter)}.` });
        break;
      case 'steal':
        lines.push({ p: 60, text: pick([`${n(e.to)} tomou a bola de ${n(e.from)}.`, `${n(e.from)} perdeu a posse para ${n(e.to)}.`], seed) });
        break;
      case 'pass':
        if (e.result === 'intercepted') lines.push({ p: 55, text: `${n(e.by)} leu o passe de ${n(e.from)} e cortou.` });
        else if (e.result === 'out') lines.push({ p: 40, text: `O passe de ${n(e.from)} saiu do campo.` });
        else if (e.result === 'astray') lines.push({ p: 40, text: `${n(e.from)} errou o passe. A bola sobrou.` });
        else if (e.result === 'loose') lines.push({ p: 30, text: `${n(e.from)} lançou no espaço, mas ninguém chegou.` });
        else if (e.kind === 'tabela') lines.push({ p: 45, text: `Tabela entre ${n(e.from)} e ${n(e.to)}.` });
        else if (e.kind === 'espaco') lines.push({ p: 35, text: `${n(e.from)} lançou no espaço para ${n(e.to)}.` });
        else lines.push({ p: 20, text: `${n(e.from)} tocou para ${n(e.to)}.` });
        break;
      case 'flow':
        lines.push({ p: 70, text: `${n(e.player)} entrou em Flow: ${skillLabel(state, e.player, e.skillId)}.` });
        break;
      case 'read':
        if (e.correct) lines.push({ p: 50, text: `${n(e.player)} leu ${READ_GUESS_LABEL[e.guess].toLowerCase()} antes de acontecer.` });
        break;
      case 'out':
        break;
      case 'halftime':
        lines.push({ p: 90, text: 'Fim do primeiro tempo.' });
        break;
      case 'end':
        lines.push({ p: 95, text: 'Fim de partida.' });
        break;
      default:
        break;
    }
  }
  for (const [id, count] of Object.entries(dribblesWon)) {
    const txt =
      count >= 2
        ? pick([`${n(id)} disparou e deixou ${count === 2 ? 'dois' : count} para trás.`, `${n(id)} passou por ${count} marcadores.`], seed)
        : pick([`${n(id)} driblou e seguiu.`, `${n(id)} venceu o duelo no drible.`], seed);
    lines.push({ p: count >= 2 ? 65 : 45, text: txt });
  }
  if (!lines.length) {
    const moved = events.some((e) => e.t === 'sprint');
    lines.push({ p: 0, text: moved ? 'Arrancadas sem bola. Os dois lados se reposicionam.' : 'Lance estudado. Ninguém arriscou.' });
  }
  lines.sort((a, b) => b.p - a.p);
  return lines.slice(0, 3).map((l) => l.text);
}
