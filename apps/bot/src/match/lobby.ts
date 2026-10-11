import { randomBytes } from 'node:crypto';
import type { Message, SendableChannels } from 'discord.js';
import { MATCH_RULES, RARITY_COST, RARITY_LABEL, getLineage, getStage, type MatchMode, type SelectionStage } from '@ego/content';
import { assertStageUnlocked, findCharacter, guildSettings, type Character } from '@ego/db';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, row, screen, section, sep, text, type Block, type ScreenSpec } from '../ui';
import { replyError } from '../util/reply';
import { sessionByUser, sessions } from './session';
import { startMatch, type Seat } from './start';

export interface Lobby {
  id: string;
  guildId: string;
  channel: SendableChannels;
  hostId: string;
  mode: MatchMode;
  kind: 'casual' | 'ranqueada' | 'selecao';
  stage: (SelectionStage & { groupId: string }) | null;
  teams: { A: string[]; B: string[] };
  keepers: { A: string | null; B: string | null };
  ready: Set<string>;
  quick: boolean;
  chars: Map<string, Character>;
  budget: number;
  message: Message | null;
  createdAt: number;
}

export const lobbies = new Map<string, Lobby>();
export const lobbyByUser = new Map<string, string>();

const size = (l: Lobby) => Number(l.mode[0]);

function rarityUsed(l: Lobby, team: 'A' | 'B'): number {
  const ids = [...l.teams[team], ...(l.keepers[team] ? [l.keepers[team]!] : [])];
  return ids.reduce((a, u) => a + RARITY_COST[getLineage(l.chars.get(u)!.lineageId!).rarity], 0);
}

function members(l: Lobby): string[] {
  return [...l.teams.A, ...l.teams.B, ...(l.keepers.A ? [l.keepers.A] : []), ...(l.keepers.B ? [l.keepers.B] : [])];
}

function seatLine(l: Lobby, u: string): string {
  const c = l.chars.get(u)!;
  const lin = getLineage(c.lineageId!);
  return `${l.ready.has(u) ? '**[pronto]**' : '[esperando]'} <@${u}> · **${c.name}** #${c.number} · ${lin.name} (${RARITY_LABEL[lin.rarity]}) · Nv ${c.level}`;
}

export function lobbySpec(l: Lobby): ScreenSpec {
  const n = size(l);
  const selecao = l.kind === 'selecao';
  const kindLabel = selecao ? `Modo Seleção · ${l.stage?.name}` : l.kind === 'ranqueada' ? 'Ranqueada' : 'Casual';
  const free = l.kind === 'ranqueada' ? '-# vaga livre' : '-# vaga livre (vira bot se ninguém entrar)';
  const team = (t: 'A' | 'B') => {
    if (t === 'B' && selecao) return l.stage!.opponents.map((o) => `${o.name} · ${getLineage(o.lineageId).name} · Nv ${o.level} (bot)`).join('\n');
    const lines = l.teams[t].map((u) => seatLine(l, u));
    for (let k = lines.length; k < n; k++) lines.push(free);
    return lines.join('\n');
  };
  const gk = (t: 'A' | 'B') => (l.keepers[t] ? seatLine(l, l.keepers[t]!) : '-# bot (clique para ser o goleiro)');
  const budget = (t: 'A' | 'B') => (l.kind === 'ranqueada' ? ` · raridade **${rarityUsed(l, t)}/${l.budget}**` : '');
  const all = members(l);
  const readyCount = all.filter((u) => l.ready.has(u)).length;
  const canStart = all.length > 0 && all.every((u) => l.ready.has(u)) && (l.kind !== 'ranqueada' || (l.teams.A.length === n && l.teams.B.length === n));
  const fmtLabel = l.quick ? `Rápida: primeiro a ${MATCH_RULES.quickFirstTo} gols` : `${MATCH_RULES.halves} tempos de ${MATCH_RULES.turnsPerHalf} lances`;
  const blocks: Block[] = [text(`## Lobby ${l.mode} · ${kindLabel}\n-# Host: <@${l.hostId}>`)];
  if (!selecao) blocks.push(section([`**Formato:** ${fmtLabel}\n-# Só o host troca.`], { button: btn(cid('lb', 'fmt', l.id), 'Trocar formato') }));
  blocks.push(sep());
  blocks.push(section([`### Time A · ${l.teams.A.length}/${n}${budget('A')}\n${team('A')}`], { button: btn(cid('lb', 'join', l.id, 'A'), 'Entrar no time A', ButtonStyle.Primary, l.teams.A.length >= n) }));
  blocks.push(section([`**Goleiro A:** ${gk('A')}`], { button: btn(cid('lb', 'gk', l.id, 'A'), 'Ser goleiro A', ButtonStyle.Secondary, !!l.keepers.A) }));
  blocks.push(sep());
  if (selecao) blocks.push(text(`### Time B · instalação\n${team('B')}\n**Goleiro B:** bot`));
  else {
    blocks.push(section([`### Time B · ${l.teams.B.length}/${n}${budget('B')}\n${team('B')}`], { button: btn(cid('lb', 'join', l.id, 'B'), 'Entrar no time B', ButtonStyle.Primary, l.teams.B.length >= n) }));
    blocks.push(section([`**Goleiro B:** ${gk('B')}`], { button: btn(cid('lb', 'gk', l.id, 'B'), 'Ser goleiro B', ButtonStyle.Secondary, !!l.keepers.B) }));
  }
  blocks.push(sep());
  const steps = [
    `**1.** Entre em um time ou no gol.${l.kind === 'ranqueada' ? ' Na ranqueada, os dois times precisam estar completos (goleiros podem ser bots).' : ' Vagas vazias viram bots.'}`,
    `**2.** Todo mundo clica em **Estou pronto** (${readyCount}/${all.length}).`,
    `**3.** O host clica em **Iniciar partida**.${canStart ? ' Tudo certo!' : ''}`,
  ];
  blocks.push(text(`**Como começar**\n${steps.join('\n')}\n-# Nunca jogou? Use **/tutorial** antes (leva 3 minutos).`));
  blocks.push(row(btn(cid('lb', 'ready', l.id), 'Estou pronto', ButtonStyle.Success), btn(cid('lb', 'leave', l.id), 'Sair do lobby')));
  blocks.push(row(btn(cid('lb', 'start', l.id), 'Iniciar partida', ButtonStyle.Primary, !canStart), btn(cid('lb', 'close', l.id), 'Fechar lobby', ButtonStyle.Danger)));
  return { accent: canStart ? 'sucesso' : 'padrao', blocks };
}

async function refresh(l: Lobby) {
  try {
    await l.message?.edit({ components: edit(lobbySpec(l)).components });
  } catch (e) {
    console.error('[lobby]', e);
  }
}

function removeUser(l: Lobby, u: string) {
  l.teams.A = l.teams.A.filter((x) => x !== u);
  l.teams.B = l.teams.B.filter((x) => x !== u);
  if (l.keepers.A === u) l.keepers.A = null;
  if (l.keepers.B === u) l.keepers.B = null;
  l.ready.delete(u);
  lobbyByUser.delete(u);
}

export function closeLobby(l: Lobby) {
  for (const u of members(l)) lobbyByUser.delete(u);
  lobbies.delete(l.id);
}

async function requireEligible(userId: string): Promise<Character> {
  const c = await findCharacter(userId);
  if (!c) throw new Error('NOCHAR');
  return c;
}

export async function openLobby(opts: { guildId: string; channel: SendableChannels; hostId: string; mode: MatchMode; kind: Lobby['kind']; stageId?: string }): Promise<Lobby> {
  const settings = await guildSettings(opts.guildId);
  const stage = opts.stageId ? getStage(opts.stageId) : null;
  const host = await findCharacter(opts.hostId);
  const l: Lobby = {
    id: randomBytes(4).toString('hex'),
    guildId: opts.guildId,
    channel: opts.channel,
    hostId: opts.hostId,
    mode: stage ? stage.mode : opts.mode,
    kind: opts.kind,
    stage,
    teams: { A: [opts.hostId], B: [] },
    keepers: { A: null, B: null },
    ready: new Set(),
    quick: false,
    chars: new Map(host ? [[opts.hostId, host]] : []),
    budget: settings.rarityBudget[stage ? stage.mode : opts.mode],
    message: null,
    createdAt: Date.now(),
  };
  if (l.kind === 'ranqueada' && rarityUsed(l, 'A') > l.budget) throw new Error('BUDGET');
  lobbies.set(l.id, l);
  lobbyByUser.set(opts.hostId, l.id);
  l.message = await opts.channel.send(screen(lobbySpec(l)));
  return l;
}

export function busyReason(userId: string): string | null {
  if (lobbyByUser.has(userId)) return 'Você já está em um lobby. Use /partida sair antes.';
  if (sessionByUser.has(userId)) return 'Você já está em uma partida.';
  return null;
}

on.command('partida', async (i) => {
  const sub = i.options.getSubcommand();
  if (sub === 'sair') {
    const lid = lobbyByUser.get(i.user.id);
    if (lid) {
      const l = lobbies.get(lid)!;
      removeUser(l, i.user.id);
      if (!members(l).length || l.hostId === i.user.id) {
        closeLobby(l);
        await l.message?.edit({ components: edit({ accent: 'aviso', blocks: [text('Lobby fechado.')] }).components }).catch(() => {});
      } else await refresh(l);
      return i.reply(screen({ accent: 'padrao', blocks: [text('Você saiu do lobby.')] }, { ephemeral: true }));
    }
    const sid = sessionByUser.get(i.user.id);
    if (sid) {
      sessions.get(sid)?.leave(i.user.id);
      return i.reply(screen({ accent: 'aviso', blocks: [text('Você saiu da partida. A IA assume sua vaga até o fim, sem gastar seu Flow.')] }, { ephemeral: true }));
    }
    return replyError(i, 'Você não está em lobby nem em partida.');
  }
  if (!i.guildId || !i.channel?.isSendable()) return replyError(i, 'Use este comando em um canal de texto do servidor.');
  const c = await findCharacter(i.user.id);
  if (!c) return replyError(i, 'Você ainda não tem personagem. Use /criar-personagem para começar.');
  if (!c.lineageId) return replyError(i, 'Você ainda não tem linhagem. Faça seu giro gratuito com /girar.');
  const busy = busyReason(i.user.id);
  if (busy) return replyError(i, busy);
  const mode = i.options.getString('modo', true) as MatchMode;
  const kind = i.options.getString('tipo', true) as 'casual' | 'ranqueada';
  try {
    await openLobby({ guildId: i.guildId, channel: i.channel, hostId: i.user.id, mode, kind });
  } catch (e) {
    if ((e as Error).message === 'BUDGET') return replyError(i, 'Sua linhagem sozinha passa do orçamento de raridade deste modo na ranqueada.');
    throw e;
  }
  await i.reply(screen({ accent: 'padrao', blocks: [text('Lobby aberto abaixo. Chame os outros jogadores.')] }, { ephemeral: true }));
});

on.component('lb', async (i, [action, id, team]) => {
  const l = lobbies.get(id);
  if (!l) return replyError(i, 'Esse lobby não existe mais.');
  const u = i.user.id;
  const n = size(l);
  if (action === 'join' || action === 'gk') {
    const t = team as 'A' | 'B';
    if (l.kind === 'selecao' && t === 'B') return replyError(i, 'O time B do Modo Seleção é da instalação.');
    const already = members(l).includes(u);
    if (!already) {
      const busy = busyReason(u);
      if (busy) return replyError(i, busy);
    }
    let c: Character;
    try {
      c = l.chars.get(u) ?? (await requireEligible(u));
    } catch {
      return replyError(i, 'Você ainda não tem personagem. Use /criar-personagem para começar.');
    }
    if (!c.lineageId) return replyError(i, 'Você ainda não tem linhagem. Faça seu giro gratuito com /girar.');
    const snapshot = { teams: { A: [...l.teams.A], B: [...l.teams.B] }, keepers: { ...l.keepers } };
    const restore = () => {
      Object.assign(l, snapshot);
      for (const m of members(l)) lobbyByUser.set(m, l.id);
    };
    removeUser(l, u);
    l.chars.set(u, c);
    if (action === 'join') {
      if (l.teams[t].length >= n) {
        restore();
        return replyError(i, 'Esse time já está completo.');
      }
      l.teams[t].push(u);
    } else {
      if (l.keepers[t]) {
        restore();
        return replyError(i, 'Essa vaga de goleiro já foi ocupada.');
      }
      l.keepers[t] = u;
    }
    if (l.kind === 'ranqueada' && rarityUsed(l, t) > l.budget) {
      removeUser(l, u);
      restore();
      return replyError(i, `Com a sua linhagem o time ${t} passa do orçamento de raridade (${l.budget}).`);
    }
    lobbyByUser.set(u, l.id);
    await i.deferUpdate();
    return refresh(l);
  }
  if (action === 'ready') {
    if (!members(l).includes(u)) return replyError(i, 'Entre em um time antes.');
    if (l.ready.has(u)) l.ready.delete(u);
    else l.ready.add(u);
    await i.deferUpdate();
    return refresh(l);
  }
  if (action === 'leave') {
    if (!members(l).includes(u)) return replyError(i, 'Você não está neste lobby.');
    removeUser(l, u);
    if (u === l.hostId || !members(l).length) {
      closeLobby(l);
      return i.update(edit({ accent: 'aviso', blocks: [text('Lobby fechado.')] }));
    }
    await i.deferUpdate();
    return refresh(l);
  }
  if (action === 'fmt') {
    if (u !== l.hostId) return replyError(i, 'Só o host muda o formato.');
    l.quick = !l.quick;
    await i.deferUpdate();
    return refresh(l);
  }
  if (action === 'close') {
    if (u !== l.hostId) return replyError(i, 'Só o host fecha o lobby.');
    closeLobby(l);
    return i.update(edit({ accent: 'aviso', blocks: [text('Lobby fechado pelo host.')] }));
  }
  if (action === 'start') {
    if (u !== l.hostId) return replyError(i, 'Só o host inicia a partida.');
    const all = members(l);
    if (!all.every((m) => l.ready.has(m))) return replyError(i, 'Todos precisam marcar Pronto.');
    if (l.kind === 'ranqueada' && (l.teams.A.length < n || l.teams.B.length < n)) return replyError(i, 'Na ranqueada os dois times precisam estar completos.');
    if (l.kind === 'selecao' && l.stage && !(await assertStageUnlocked(l.chars.get(l.hostId)!.id, l.stage.id))) return replyError(i, 'Essa etapa ainda está bloqueada para o host.');
    // recarrega personagens (podem ter mudado desde que entraram)
    const seat = async (uid: string): Promise<Seat> => ({ userId: uid, character: (await findCharacter(uid))! });
    closeLobby(l);
    await i.update(edit({ accent: 'sucesso', blocks: [text(`### Lobby fechado\nPartida ${l.mode} iniciando abaixo.`)] }));
    await startMatch({
      guildId: l.guildId,
      channel: l.channel,
      mode: l.mode,
      kind: l.kind,
      teamA: await Promise.all(l.teams.A.map(seat)),
      teamB: await Promise.all(l.teams.B.map(seat)),
      keeperA: l.keepers.A ? await seat(l.keepers.A) : null,
      keeperB: l.keepers.B ? await seat(l.keepers.B) : null,
      botsB: l.stage?.opponents,
      botDifficultyB: l.stage?.difficulty,
      stageId: l.stage?.id ?? null,
      quick: l.quick,
      rules: l.stage ? l.stage.rules : undefined,
      label: l.kind === 'selecao' ? `${l.mode} · ${l.stage!.name}` : `${l.mode} · ${l.kind === 'ranqueada' ? 'Ranqueada' : 'Casual'}`,
    });
  }
});
