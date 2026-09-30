import {
  ATTR_LABEL,
  DIFFICULTY_LABEL,
  GACHA,
  GAME,
  RARITY_LABEL,
  RARITIES,
  SELECTION_GROUPS,
  SITE_PATHS,
  findLineage,
  getLineage,
  type AttrKey,
  type Reward,
} from '@ego/content';
import { decideSpin, findCharacter, missionBoard, pendingSpin, selectionStatus, spin, type Character } from '@ego/db';
import { renderGachaGif, renderStage } from '@ego/render';
import { siteLink } from '../env';
import { busyReason, openLobby } from '../match/lobby';
import { startMatch } from '../match/start';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, file, images, linkBtn, progressBar, row, screen, select, selectBlock, sep, text, type ScreenSpec } from '../ui';
import { replyError } from '../util/reply';
import { assertOwner, ownCharacter, replyWithLoading, updateWithLoading } from './common';

export function rewardPreview(r: Reward): string {
  const parts: string[] = [];
  if (r.xp) parts.push(`${r.xp} XP`);
  if (r.ienes) parts.push(`${r.ienes} Ienes`);
  if (r.coins) parts.push(`${r.coins} ${GAME.premiumCurrency.short}`);
  for (const [k, v] of Object.entries(r.tokens ?? {}) as [AttrKey, number][]) parts.push(`${v} fichas de ${ATTR_LABEL[k]}`);
  return parts.join(' · ') || '—';
}

// ---------------------------------------------------------------------------
// Modo Seleção
// ---------------------------------------------------------------------------

async function selectionScreen(owner: string, groupId: string, stageId?: string): Promise<ScreenSpec> {
  const c = await findCharacter(owner);
  if (!c) return { accent: 'erro', blocks: [text('Você ainda não tem personagem. Use /criar-personagem para começar.')] };
  const status = await selectionStatus(c.id);
  const g = status.find((x) => x.group.id === groupId) ?? status[0];
  const current = g.stages.find((s) => s.stage.id === stageId) ?? g.stages.find((s) => s.unlocked && !s.cleared) ?? g.stages[0];
  const png = await renderStage(current.stage, g.group.name, current);
  const list = g.stages
    .map((s, idx) => `\`${String(idx + 1).padStart(2, '0')}\` ${s.cleared ? '**superada**' : s.unlocked ? 'disponível' : 'bloqueada'} · ${s.stage.name} · ${s.stage.mode} · ${DIFFICULTY_LABEL[s.stage.difficulty]}`)
    .join('\n');
  return {
    accent: 'padrao',
    tabs: { current: g.group.id, items: SELECTION_GROUPS.map((x) => ({ id: x.id, label: x.name, customId: cid('se', 'tab', owner, x.id) })) },
    files: [file(png, 'etapa.png')],
    blocks: [
      text(`### ${g.group.name}${g.completed ? ' · concluída' : ''}\n${g.group.description}`),
      images('etapa.png'),
      text(`${list}\n**Primeira vitória:** ${rewardPreview(current.stage.firstReward)}\n**Repetição:** ${rewardPreview(current.stage.repeatReward)}${current.stage.dropItem ? ` · chance de drop ${Math.round(current.stage.dropChance * 100)}%` : ''}`),
      selectBlock(select(cid('se', 'pick', owner, g.group.id), 'Ver etapa', g.stages.map((s) => ({ label: s.stage.name, value: s.stage.id, description: `${s.stage.mode} · ${s.cleared ? 'superada' : s.unlocked ? 'disponível' : 'bloqueada'}`, default: s.stage.id === current.stage.id })))),
      row(
        btn(cid('se', 'solo', owner, current.stage.id), 'Jogar sozinho', ButtonStyle.Primary, !current.unlocked),
        btn(cid('se', 'group', owner, current.stage.id), 'Chamar amigos', ButtonStyle.Secondary, !current.unlocked || current.stage.mode === '1v1'),
        linkBtn(siteLink(SITE_PATHS.selecao), 'Progresso no site'),
      ),
    ],
  };
}

on.command('selecao', async (i) => {
  await replyWithLoading(i, 'Abrindo o Modo Seleção...', () => selectionScreen(i.user.id, SELECTION_GROUPS[0].id));
});

on.component('se', async (i, [action, owner, arg]) => {
  assertOwner(i, owner);
  if (action === 'tab') return updateWithLoading(i, 'Carregando...', () => selectionScreen(owner, arg));
  if (action === 'pick' && i.isStringSelectMenu()) return updateWithLoading(i, 'Carregando...', () => selectionScreen(owner, arg, i.values[0]));
  if (action === 'solo' || action === 'group') {
    const c = await ownCharacter(owner);
    if (!c.lineageId) return replyError(i, 'Você ainda não tem linhagem. Faça seu giro gratuito com /girar.');
    const busy = busyReason(owner);
    if (busy) return replyError(i, busy);
    if (!i.guildId || !i.channel?.isSendable()) return replyError(i, 'Use em um canal de texto do servidor.');
    const status = await selectionStatus(c.id);
    const st = status.flatMap((g) => g.stages).find((s) => s.stage.id === arg);
    if (!st?.unlocked) return replyError(i, 'Essa etapa ainda está bloqueada. Supere a anterior.');
    if (action === 'group') {
      await openLobby({ guildId: i.guildId, channel: i.channel, hostId: owner, mode: st.stage.mode, kind: 'selecao', stageId: st.stage.id });
      return i.update(edit({ accent: 'padrao', blocks: [text(`Lobby de ${st.stage.name} aberto abaixo. Chame seus companheiros.`)] }));
    }
    await i.update(edit({ accent: 'padrao', blocks: [text(`### ${st.stage.name}\nA avaliação começa abaixo.`)] }));
    await startMatch({
      guildId: i.guildId,
      channel: i.channel,
      mode: st.stage.mode,
      kind: 'selecao',
      teamA: [{ userId: owner, character: c }],
      teamB: [],
      botsB: st.stage.opponents,
      botDifficultyB: st.stage.difficulty,
      stageId: st.stage.id,
      rules: st.stage.rules,
      label: `${st.stage.mode} · ${st.stage.name}`,
    });
  }
});

// ---------------------------------------------------------------------------
// Missões
// ---------------------------------------------------------------------------

type MissionTab = 'diarias' | 'semanais' | 'despertares';

async function missionsScreen(owner: string, tab: MissionTab): Promise<ScreenSpec> {
  const c = await findCharacter(owner);
  if (!c) return { accent: 'erro', blocks: [text('Você ainda não tem personagem. Use /criar-personagem para começar.')] };
  const b = await missionBoard(c.id);
  const list = tab === 'diarias' ? b.daily : tab === 'semanais' ? b.weekly : b.awakening;
  const lines = list.map((m) => {
    const lin = m.lineageId ? ` · ${findLineage(m.lineageId)?.name}` : '';
    return `${m.completed ? '**[feita]**' : ''} **${m.name}**${lin}\n${m.description} ${progressBar(m.progress, m.target, 10)} ${m.progress}/${m.target}\n-# ${rewardPreview(m.reward)}`;
  });
  const bonus =
    tab === 'diarias'
      ? `\nBônus por fechar as ${b.bonus.dailyCount}: **${b.bonus.allDaily} ${GAME.premiumCurrency.short}**${b.dailyBonusClaimed ? ' (recebido)' : ''}`
      : tab === 'semanais'
        ? `\nBônus por fechar as ${b.bonus.weeklyCount}: **${b.bonus.allWeekly} ${GAME.premiumCurrency.short}**${b.weeklyBonusClaimed ? ' (recebido)' : ''}`
        : '\nDespertares liberam nós especiais da árvore da linhagem. Só contam com a linhagem equipada.';
  return {
    accent: 'padrao',
    tabs: {
      current: tab,
      items: [
        { id: 'diarias', label: 'Diárias', customId: cid('ms', owner, 'diarias') },
        { id: 'semanais', label: 'Semanais', customId: cid('ms', owner, 'semanais') },
        { id: 'despertares', label: 'Despertares', customId: cid('ms', owner, 'despertares') },
      ],
    },
    blocks: [text(`### Missões${bonus}`), sep(), text(lines.join('\n\n') || 'Nada aqui.'), row(linkBtn(siteLink(SITE_PATHS.missoes), 'Missões no site'))],
  };
}

on.command('missoes', async (i) => replyWithLoading(i, 'Carregando missões...', () => missionsScreen(i.user.id, 'diarias'), true));
on.component('ms', async (i, [owner, tab]) => {
  assertOwner(i, owner);
  return updateWithLoading(i, 'Carregando...', () => missionsScreen(owner, tab as MissionTab));
});

// ---------------------------------------------------------------------------
// Giro de linhagem
// ---------------------------------------------------------------------------

function ratesText(): string {
  const rates = RARITIES.map((r) => `${RARITY_LABEL[r]} **${(GACHA.rates[r] * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%**`).join(' · ');
  return `${rates}\nGarantia: Lendária ou melhor em até **${GACHA.pityLegendary}** giros sem uma; Mítica em até **${GACHA.pityMythic}**.`;
}

async function gachaHome(c: Character): Promise<ScreenSpec> {
  const pend = await pendingSpin(c.id);
  const lin = findLineage(c.lineageId);
  const cost = c.freeSpin ? 'Giro gratuito disponível' : `Custo: **${GACHA.cost} ${GAME.premiumCurrency.plural}** · você tem **${c.coins}**`;
  const blocks = [
    text(`### Giro de linhagem\nLinhagem atual: **${lin ? `${lin.name} · ${RARITY_LABEL[lin.rarity]}` : 'nenhuma'}**\n${cost}`),
    text(ratesText()),
    text(`Seus contadores: **${c.pityLegendary}/${GACHA.pityLegendary}** para Lendária · **${c.pityMythic}/${GACHA.pityMythic}** para Mítica.\n-# Você tem 1 espaço de linhagem. Ao aceitar, a nova linhagem é equipada. A árvore de cada linhagem fica salva.`),
  ];
  if (pend) {
    blocks.push(text(`Resultado pendente: **${getLineage(pend.lineageId).name}** (${RARITY_LABEL[pend.rarity as keyof typeof RARITY_LABEL]}).`));
    blocks.push(row(btn(cid('gc', 'accept', c.discordId, pend.id), 'Aceitar', ButtonStyle.Success), btn(cid('gc', 'discard', c.discordId, pend.id), 'Descartar', ButtonStyle.Danger)));
  } else {
    blocks.push(row(btn(cid('gc', 'spin', c.discordId), c.freeSpin ? 'Girar grátis' : `Girar (${GACHA.cost})`, ButtonStyle.Primary, !c.freeSpin && c.coins < GACHA.cost), linkBtn(siteLink(SITE_PATHS.giro), 'Giro no site')));
  }
  return { accent: lin?.rarity ?? 'padrao', blocks };
}

on.command('girar', async (i) => {
  const c = await ownCharacter(i.user.id);
  await i.reply(screen(await gachaHome(c), { ephemeral: true }));
});

on.component('gc', async (i, [action, owner, logId]) => {
  assertOwner(i, owner);
  const c = await ownCharacter(owner);
  if (action === 'open') return i.reply(screen(await gachaHome(c), { ephemeral: true }));
  if (action === 'spin') {
    await i.update(edit({ accent: 'padrao', blocks: [text('### Avaliação de linhagem\nAnalisando...')] }));
    try {
      const r = await spin(c.id);
      const lin = getLineage(r.lineageId);
      const gif = await renderGachaGif(r.rarity, r.lineageId, r.logId);
      const after = (await findCharacter(owner))!;
      const blocks = [
        text(`### ${lin.name} · ${RARITY_LABEL[r.rarity]}${r.forcedBy ? ' · garantia' : ''}\n${lin.tagline}${r.isNew ? '' : '\n-# Você já tinha essa linhagem: a árvore dela continua como você deixou.'}`),
        images('giro.gif'),
      ];
      if (r.autoAccepted) blocks.push(text('Primeira linhagem equipada. Monte seu loadout no site e distribua seus pontos.'), row(linkBtn(siteLink(SITE_PATHS.linhagem), 'Ver a árvore no site')));
      else blocks.push(row(btn(cid('gc', 'accept', owner, r.logId), 'Aceitar', ButtonStyle.Success), btn(cid('gc', 'discard', owner, r.logId), 'Descartar', ButtonStyle.Danger)));
      blocks.push(text(`-# Contadores: ${after.pityLegendary}/${GACHA.pityLegendary} Lendária · ${after.pityMythic}/${GACHA.pityMythic} Mítica. Log ${r.logId.slice(-8)}.`));
      return i.editReply(edit({ accent: r.rarity, files: [file(gif, 'giro.gif')], blocks }));
    } catch (e) {
      const msg = (e as Error).name === 'GameError' ? (e as Error).message : 'Algo deu errado do nosso lado. Tente de novo em instantes.';
      if ((e as Error).name !== 'GameError') console.error(e);
      return i.editReply(edit({ accent: 'erro', blocks: [text(msg)] }));
    }
  }
  if (action === 'accept' || action === 'discard') {
    const r = await decideSpin(c.id, logId, action === 'accept');
    const lin = getLineage(r.lineageId);
    return i.update(
      edit(
        action === 'accept'
          ? { accent: lin.rarity, blocks: [text(`### Linhagem equipada: ${lin.name}\nSua árvore e seu loadout desta linhagem estão ativos.`), row(linkBtn(siteLink(SITE_PATHS.linhagem), 'Árvore no site'))] }
          : { accent: 'aviso', blocks: [text(`${lin.name} descartada. Sua linhagem continua a mesma.`)] },
      ),
    );
  }
});

