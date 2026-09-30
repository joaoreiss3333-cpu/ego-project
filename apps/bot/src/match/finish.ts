import { ATTR_LABEL, GAME, findCosmetic, getEquipment, getLineage, type AttrKey } from '@ego/content';
import { finalizeMatch, finishTraining, type AppliedReward, type FinalizeResult } from '@ego/db';
import { renderResultCard } from '@ego/render';
import { file, images, sep, text, type ScreenSpec } from '../ui';
import type { MatchSession } from './session';

const KIND_LABEL: Record<string, string> = { casual: 'Casual', ranqueada: 'Ranqueada', selecao: 'Modo Seleção', treino: 'Treino 1v1', simulacao: 'Simulação' };

export function rewardLine(r: AppliedReward | null): string {
  if (!r) return 'sem recompensa';
  const parts = [`${r.xp} XP`, `${r.ienes} Ienes`];
  if (r.coins) parts.push(`${r.coins} ${GAME.premiumCurrency.plural}`);
  for (const [k, v] of Object.entries(r.tokens) as [AttrKey, number][]) if (v) parts.push(`${v} fichas de ${ATTR_LABEL[k]}`);
  for (const it of r.items) parts.push(getEquipment(it).name);
  for (const c of r.cosmetics) parts.push(findCosmetic(c)?.name ?? c);
  if (r.levelsGained) parts.push(`subiu para o nível ${r.newLevel}`);
  return parts.join(' · ');
}

async function resultImage(s: MatchSession) {
  const st = s.state;
  return renderResultCard({
    score: st.score,
    winner: st.winner,
    mode: s.setup.mode,
    kindLabel: KIND_LABEL[s.setup.kind] ?? s.setup.kind,
    teamColors: { A: s.teamColor('A'), B: s.teamColor('B') },
    serial: s.id.slice(-8).toUpperCase(),
    players: s.setup.slots.map((x) => {
      const p = st.players[x.id];
      return {
        name: x.name,
        number: x.number,
        team: x.team,
        lineageId: x.lineageId,
        rarity: getLineage(x.lineageId).rarity,
        goals: p.stats.goals,
        assists: p.stats.assists,
        ego: p.ego,
        chem: p.chem,
        dribbles: p.stats.dribblesWon,
        reads: p.stats.readsCorrect,
        saves: p.stats.saves,
        isKeeper: x.isKeeper,
        isBot: x.isBot,
      };
    }),
  });
}

function headline(s: MatchSession): string {
  const w = s.state.winner;
  return w === 'draw' ? 'Empate.' : w ? `Vitória do time ${w}.` : 'Partida encerrada.';
}

/** Casual, ranqueada e Modo Seleção: fecha no servidor e mostra recompensas. */
export async function finishRegular(s: MatchSession): Promise<ScreenSpec> {
  const res: FinalizeResult = await finalizeMatch(s.id, s.state, s.turns);
  const png = await resultImage(s);
  const lines: string[] = [];
  for (const p of res.participants) {
    const u = s.participants.find((x) => x.slotId === p.slotId);
    const who = u ? `<@${u.userId}>` : p.slotId;
    let line = `${who}: `;
    if (p.selection) {
      line += p.selection.reward ? `${p.selection.first ? 'primeira vitória na etapa · ' : ''}${rewardLine(p.selection.reward)}` : 'etapa não superada';
      if (p.selection.drop) line += ` · drop: ${getEquipment(p.selection.drop).name}`;
      if (p.selection.groupCompleted) line += ' · seleção concluída';
    } else line += rewardLine(p.reward);
    if (p.mmrDelta !== null) line += ` · MMR ${p.mmrDelta >= 0 ? '+' : ''}${p.mmrDelta}`;
    if (p.multiplier < 1) line += `\n-# Recompensa reduzida (${Math.round(p.multiplier * 100)}%): ${p.multiplierReasons.join('; ')}.`;
    for (const m of p.missions.completed) line += `\n-# Missão concluída: ${m.mission.name}.`;
    for (const b of p.missions.bonus) line += `\n-# Bônus de missões ${b.kind === 'daily' ? 'diárias' : 'semanais'}: +${b.coins} ${GAME.premiumCurrency.plural}.`;
    for (const c of p.cosmeticsUnlocked) line += `\n-# Cosmético liberado: ${findCosmetic(c)?.name ?? c}.`;
    lines.push(line);
  }
  if (res.flagged) lines.push(`-# Partida marcada para revisão: ${res.flagReason}. Não contou para o MMR.`);
  return {
    accent: 'sucesso',
    files: [file(png, 'resultado.png')],
    blocks: [text(`### Relatório de partida\n${headline(s)} **A ${res.score.A} : ${res.score.B} B**`), images('resultado.png'), sep(), text(lines.join('\n') || 'Sem jogadores humanos.')],
  };
}

/** Treino 1v1: recompensa de treino. */
export async function finishTraining1v1(s: MatchSession): Promise<ScreenSpec> {
  const p = s.participants[0];
  const st = s.state;
  const me = st.players[p.slotId];
  const won = st.winner === me.team;
  const { reward, missions } = await finishTraining(p.characterId, { kind: '1v1', goals: me.stats.goals, won, reads: me.stats.readsCorrect });
  const png = await resultImage(s);
  const extra = missions.completed.map((m) => `-# Missão concluída: ${m.mission.name}.`).join('\n');
  return {
    accent: 'sucesso',
    files: [file(png, 'resultado.png')],
    blocks: [text(`### Treino 1v1 concluído\n${won ? 'Venceu o bot.' : st.winner === 'draw' ? 'Empatou com o bot.' : 'O bot venceu.'} **${st.score.A} : ${st.score.B}**`), images('resultado.png'), text(`<@${p.userId}>: ${rewardLine(reward)}${extra ? `\n${extra}` : ''}`)],
  };
}
