import {
  ATTRS,
  ATTR_LABEL,
  ENERGY,
  GAME,
  GUIDES,
  RARITY_LABEL,
  SITE_PATHS,
  findGuide,
  findLineage,
  type CosmeticType,
  type RankGroup,
} from '@ego/content';
import {
  currentEnergy,
  equipCosmetic,
  equipItem,
  findCharacter,
  formatDuration,
  giveCurrency,
  inventory,
  leaderboard,
  rankPosition,
  resetCharacter,
  updateGuildSettings,
  guildSettings,
  tokensOf,
} from '@ego/db';
import type { MatchMode } from '@ego/content';
import { siteLink } from '../env';
import { sessionByChannel, sessions } from '../match/session';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, linkBtn, row, screen, select, selectBlock, sep, text, type ScreenSpec } from '../ui';
import { replyError } from '../util/reply';
import { assertOwner, fmt, ownCharacter, replyWithLoading, updateWithLoading } from './common';

// ---------------------------------------------------------------------------
// Inventário
// ---------------------------------------------------------------------------

type InvTab = 'equipamentos' | 'cosmeticos' | 'materiais';

async function inventoryScreen(owner: string, tab: InvTab): Promise<ScreenSpec> {
  const c = await ownCharacter(owner);
  const inv = await inventory(c.id);
  let body = '';
  if (tab === 'equipamentos') {
    body = inv.equipment.length
      ? inv.equipment.map((e) => `${e.equipped ? '**[equipado]** ' : ''}**${e.def.name}** +${e.level} · ${ATTR_LABEL[e.def.attr]} +${e.def.bonusByLevel[e.level]}\n-# ${e.def.source}`).join('\n')
      : 'Nenhum equipamento. Eles caem no Modo Seleção.';
  } else if (tab === 'cosmeticos') {
    body = inv.cosmetics
      .map((x) => {
        const how =
          x.def.unlock.kind === 'craft'
            ? `criar: ${Object.entries(x.def.unlock.tokens).map(([k, v]) => `${v} fichas de ${ATTR_LABEL[k as keyof typeof ATTR_LABEL]}`).join(', ')} + ${x.def.unlock.ienes} Ienes`
            : x.def.unlock.kind === 'stat'
              ? `marcar ${x.def.unlock.value} gols`
              : x.def.unlock.kind === 'selection'
                ? 'completar a Primeira Seleção'
                : `ter uma linhagem ${RARITY_LABEL[x.def.unlock.rarity!]}`;
        return `${x.equipped ? '**[equipado]** ' : x.owned ? '[liberado] ' : '[bloqueado] '}**${x.def.name}** · ${x.def.type}\n-# ${how}`;
      })
      .join('\n');
  } else {
    const tok = tokensOf(inv.character);
    const e = currentEnergy(inv.character);
    body = `**${fmt(inv.character.ienes)}** ${GAME.commonCurrency.plural} · **${fmt(inv.character.coins)}** ${GAME.premiumCurrency.plural}\nEnergia de treino **${e.energy}/${ENERGY.max}**${e.energy < ENERGY.max ? ` · próxima em ${formatDuration(e.nextInMs)}` : ''}\n\n**Fichas de Treino**\n${ATTRS.map((k) => `\`${ATTR_LABEL[k].padEnd(10)}\` ${tok[k]}`).join('\n')}`;
  }
  const link = tab === 'equipamentos' ? SITE_PATHS.equipamentos : tab === 'cosmeticos' ? SITE_PATHS.cosmeticos : SITE_PATHS.materiais;
  return {
    accent: 'padrao',
    tabs: {
      current: tab,
      items: [
        { id: 'equipamentos', label: 'Equipamentos', customId: cid('iv', owner, 'equipamentos') },
        { id: 'cosmeticos', label: 'Cosméticos', customId: cid('iv', owner, 'cosmeticos') },
        { id: 'materiais', label: 'Materiais', customId: cid('iv', owner, 'materiais') },
      ],
    },
    blocks: [text(`### Inventário`), text(body), row(linkBtn(siteLink(link), 'Abrir no site'))],
  };
}

on.command('inventario', async (i) => replyWithLoading(i, 'Carregando inventário...', () => inventoryScreen(i.user.id, 'equipamentos'), true));
on.component('iv', async (i, [owner, tab]) => {
  assertOwner(i, owner);
  return updateWithLoading(i, 'Carregando...', () => inventoryScreen(owner, tab as InvTab));
});

async function equipScreen(owner: string, note?: string): Promise<ScreenSpec> {
  const c = await ownCharacter(owner);
  const inv = await inventory(c.id);
  const blocks = [text(`### Equipar${note ? `\n${note}` : ''}`)];
  if (inv.equipment.length)
    blocks.push(selectBlock(select(cid('eq', owner, 'item'), 'Equipamento', inv.equipment.slice(0, 25).map((e) => ({ label: `${e.def.name} +${e.level}`, value: e.id, description: `${ATTR_LABEL[e.def.attr]} +${e.def.bonusByLevel[e.level]}${e.equipped ? ' · equipado' : ''}` })))));
  for (const type of ['moldura', 'titulo', 'rastro'] as CosmeticType[]) {
    const owned = inv.cosmetics.filter((x) => x.owned && x.def.type === type);
    if (!owned.length) continue;
    blocks.push(
      selectBlock(
        select(cid('eq', owner, type), type === 'moldura' ? 'Moldura' : type === 'titulo' ? 'Título' : 'Rastro', [
          { label: 'Nenhum', value: 'none' },
          ...owned.map((x) => ({ label: x.def.name, value: x.def.id, default: x.equipped })),
        ]),
      ),
    );
  }
  if (blocks.length === 1) blocks.push(text('Nada para equipar ainda.'));
  return { accent: 'padrao', blocks };
}

on.command('equipar', async (i) => replyWithLoading(i, 'Carregando...', () => equipScreen(i.user.id), true));
on.component('eq', async (i, [owner, what]) => {
  assertOwner(i, owner);
  if (!i.isStringSelectMenu()) return;
  const c = await ownCharacter(owner);
  const v = i.values[0];
  if (what === 'item') await equipItem(c.id, v);
  else await equipCosmetic(c.id, what as CosmeticType, v === 'none' ? null : v);
  return updateWithLoading(i, 'Salvando...', () => equipScreen(owner, 'Salvo.'));
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

async function rankingScreen(owner: string, guildId: string, group: RankGroup): Promise<ScreenSpec> {
  const lb = await leaderboard(guildId, group, 10);
  const c = await findCharacter(owner);
  const mine = c ? await rankPosition(c.id, guildId, group) : null;
  const lines = lb.rows.map((r) => `\`#${String(r.position).padStart(3, ' ')}\` **${r.character.name}** · ${findLineage(r.character.lineageId)?.name ?? '—'} · MMR **${r.mmr}** · ${r.wins}V ${r.losses}D`);
  const me = mine?.position ? `## #${mine.position}\nVocê está em **#${mine.position}** de ${mine.total}. MMR **${mine.mmr}**. Suba.` : 'Você ainda não tem posição neste grupo. Jogue uma ranqueada.';
  return {
    accent: 'padrao',
    tabs: {
      current: group,
      items: [
        { id: 'solo', label: 'Solo', customId: cid('rk', owner, 'solo') },
        { id: 'time', label: 'Time', customId: cid('rk', owner, 'time') },
      ],
    },
    blocks: [
      text(`### Ranking ${group === 'solo' ? 'Solo (1v1 e 2v2)' : 'Time (3v3 a 5v5)'} · ${lb.season.name}\n-# Termina em ${lb.season.endsAt.toLocaleDateString('pt-BR')}.`),
      text(me),
      sep(),
      text(lines.join('\n') || 'Ninguém ranqueado ainda.'),
      row(linkBtn(siteLink(group === 'solo' ? SITE_PATHS.rankingSolo : SITE_PATHS.rankingTime), 'Ranking completo no site')),
    ],
  };
}

on.command('ranking', async (i) => {
  if (!i.guildId) return replyError(i, 'Use no servidor.');
  const group = (i.options.getString('modo') ?? 'solo') as RankGroup;
  await replyWithLoading(i, 'Carregando ranking...', () => rankingScreen(i.user.id, i.guildId!, group));
});
on.component('rk', async (i, [owner, group]) => {
  assertOwner(i, owner);
  return updateWithLoading(i, 'Carregando...', () => rankingScreen(owner, i.guildId!, group as RankGroup));
});

// ---------------------------------------------------------------------------
// Guia e site
// ---------------------------------------------------------------------------

on.autocomplete('guia', async (i) => {
  const q = i.options.getFocused().toLowerCase();
  const matches = GUIDES.filter((g) => !q || g.title.toLowerCase().includes(q) || g.keywords.some((k) => k.includes(q))).slice(0, 25);
  await i.respond(matches.map((g) => ({ name: g.title, value: g.slug })));
});

on.command('guia', async (i) => {
  const slug = i.options.getString('tema');
  const g = slug ? findGuide(slug) : null;
  const url = siteLink(g ? SITE_PATHS.guia(g.slug) : SITE_PATHS.guias);
  await i.reply(
    screen(
      {
        accent: 'padrao',
        blocks: [text(g ? `### Guia: ${g.title}` : '### Guias da instalação\nTodas as regras, com exemplos ilustrados. Os números vêm direto do jogo.'), row(linkBtn(url, g ? 'Abrir guia' : 'Abrir guias'))],
      },
      { ephemeral: true },
    ),
  );
});

on.command('site', async (i) => {
  await i.reply(
    screen(
      {
        accent: 'padrao',
        blocks: [text(`### ${GAME.name}\nNo site você compra nós da árvore, monta o loadout, distribui pontos, gira linhagem e consulta os guias. Entre com a sua conta do Discord.`), row(linkBtn(siteLink(SITE_PATHS.login), 'Entrar no site'))],
      },
      { ephemeral: true },
    ),
  );
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

on.command('admin', async (i) => {
  if (!i.guildId || !i.memberPermissions?.has('ManageGuild')) return replyError(i, 'Só a gerência do servidor usa esses comandos.');
  const sub = i.options.getSubcommand();
  const ok = (msg: string) => i.reply(screen({ accent: 'sucesso', blocks: [text(msg)] }, { ephemeral: true }));
  if (sub === 'dar-coins' || sub === 'dar-ienes') {
    const u = i.options.getUser('usuario', true);
    const q = i.options.getInteger('quantidade', true);
    const c = await giveCurrency(i.guildId, i.user.id, u.id, sub === 'dar-coins' ? 'coins' : 'ienes', q);
    return ok(`<@${u.id}> agora tem **${fmt(sub === 'dar-coins' ? c.coins : c.ienes)}** ${sub === 'dar-coins' ? GAME.premiumCurrency.plural : GAME.commonCurrency.plural}.`);
  }
  if (sub === 'resetar-personagem') {
    const u = i.options.getUser('usuario', true);
    await resetCharacter(i.guildId, i.user.id, u.id);
    return ok(`Personagem de <@${u.id}> apagado. Ele pode criar outro com /criar-personagem.`);
  }
  if (sub === 'debug-ia' || sub === 'encerrar-partida') {
    const sid = sessionByChannel.get(i.channelId);
    const s = sid ? sessions.get(sid) : null;
    if (!s) return replyError(i, 'Não há partida rodando neste canal.');
    if (sub === 'debug-ia') {
      s.debugAi = !s.debugAi;
      return ok(`Depuração da IA ${s.debugAi ? 'ligada' : 'desligada'} nesta partida. A cada lance sai o plano do time, a função e as 3 melhores opções de cada bot.`);
    }
    await s.abort('Partida encerrada pela gerência. Sem recompensas.');
    return ok('Partida encerrada sem recompensas.');
  }
  if (sub === 'config') {
    const planSeconds = i.options.getInteger('tempo-do-lance') ?? undefined;
    const gif = i.options.getBoolean('gif') ?? undefined;
    const mode = (i.options.getString('modo') ?? undefined) as MatchMode | undefined;
    const budget = i.options.getInteger('orcamento') ?? undefined;
    if (budget !== undefined && !mode) return replyError(i, 'Informe o modo junto com o orçamento.');
    const cur = planSeconds === undefined && gif === undefined && budget === undefined ? await guildSettings(i.guildId) : await updateGuildSettings(i.guildId, i.user.id, { planSeconds, gifEnabled: gif, mode, budget });
    const budgets = Object.entries(cur.rarityBudget)
      .map(([m, v]) => `${m}: ${v}`)
      .join(' · ');
    return ok(`### Configuração do servidor\nTempo do lance: **${cur.planSeconds}s**\nGIF dos passos: **${cur.gifEnabled ? 'ligado' : 'desligado'}**\nOrçamento de raridade: ${budgets}`);
  }
});

