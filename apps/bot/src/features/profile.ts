import {
  ATTRS,
  ATTR_LABEL,
  MASTERY,
  POSITION_LABEL,
  RARITY_LABEL,
  SITE_PATHS,
  findCosmetic,
  getEquipment,
  getSkill,
  resolveSkill,
  type AttrKey,
  type Position,
} from '@ego/content';
import { allocateAttribute, findCharacter, prisma, profileView, type ProfileView } from '@ego/db';
import { renderProfileCard } from '@ego/render';
import { siteLink } from '../env';
import { cid, on } from '../router';
import { ButtonStyle, btn, file, images, linkBtn, progressBar, row, select, selectBlock, sep, text, type Block, type ScreenSpec } from '../ui';
import { assertOwner, replyWithLoading, updateWithLoading } from './common';

export type ProfileTab = 'resumo' | 'atributos' | 'linhagem' | 'equipamentos' | 'cosmeticos' | 'maestria';
const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'atributos', label: 'Atributos' },
  { id: 'linhagem', label: 'Linhagem' },
  { id: 'equipamentos', label: 'Equipamentos' },
  { id: 'cosmeticos', label: 'Cosméticos' },
  { id: 'maestria', label: 'Maestria' },
];

export function cardData(v: ProfileView) {
  const c = v.character;
  return {
    name: c.name,
    number: c.number,
    position: c.position as Position,
    tokenColor: c.tokenColor,
    level: c.level,
    xp: c.xp,
    xpNeeded: v.xpNeeded,
    lineage: v.lineage ? { id: v.lineage.id, name: v.lineage.name, rarity: v.lineage.rarity } : null,
    rank: { solo: v.rank.solo.position, time: v.rank.time.position, mmrSolo: v.rank.solo.mmr, mmrTime: v.rank.time.mmr },
    attrs: v.effective,
    caps: v.caps,
    titleId: c.titleId,
    frameId: c.frameId,
    portraitPath: c.portraitPath,
    marketValue: v.marketValue,
    stats: { goals: c.goals, assists: c.assists, matches: c.matches, wins: c.wins },
    serial: `${String(c.number).padStart(2, '0')}-${c.id.slice(-6).toUpperCase()}`,
  };
}

async function tabContent(v: ProfileView, tab: ProfileTab, viewer: string, selected?: AttrKey): Promise<{ blocks: Block[]; files: ReturnType<typeof file>[] }> {
  const c = v.character;
  const own = viewer === c.discordId;
  const accentLine = v.lineage ? `${v.lineage.name} · ${RARITY_LABEL[v.lineage.rarity]}` : 'Sem linhagem';
  switch (tab) {
    case 'resumo': {
      const png = await renderProfileCard(cardData(v));
      const rank = v.rank.solo.position ? `#${v.rank.solo.position} no Solo` : v.rank.time.position ? `#${v.rank.time.position} no Time` : 'Sem ranking ainda';
      return {
        files: [file(png, 'perfil.png')],
        blocks: [
          text(`## ${c.name}\n${accentLine} · Nível **${c.level}** · ${POSITION_LABEL[c.position as Position]} · ${rank}`),
          images('perfil.png'),
          row(linkBtn(siteLink(SITE_PATHS.perfil), 'Abrir no site')),
        ],
      };
    }
    case 'atributos': {
      const lines = ATTRS.map((k) => {
        const eff = v.effective[k] !== v.base[k] ? ` (+${v.effective[k] - v.base[k]} equip.)` : '';
        return `\`${ATTR_LABEL[k].padEnd(10)}\` **${String(v.base[k]).padStart(2, '0')}**/${v.caps[k]}${eff} · fichas ${v.tokens[k]}`;
      });
      const blocks: Block[] = [text(`### Atributos\nPontos de Atributo: **${c.attrPoints}**\n${lines.join('\n')}`)];
      if (own) {
        const sel = selected ?? ATTRS.find((k) => v.costs.find((x) => x.attr === k)?.ok) ?? 'velocidade';
        const cost = v.costs.find((x) => x.attr === sel)!;
        blocks.push(
          sep(),
          selectBlock(
            select(
              cid('pf', 'attrsel', c.discordId),
              'Escolha o atributo',
              ATTRS.map((k) => ({ label: ATTR_LABEL[k], value: k, description: `${v.base[k]} → ${v.base[k] + 1} (teto ${v.caps[k]})`, default: k === sel })),
            ),
          ),
          text(
            cost.ok
              ? `**${ATTR_LABEL[sel]}** ${cost.current} → ${cost.target}. Custo: 1 ponto${cost.tokens ? ` e **${cost.tokens}** fichas (você tem ${cost.tokensOwned})` : ''}.`
              : `**${ATTR_LABEL[sel]}**: ${cost.reason}`,
          ),
          row(btn(cid('pf', 'attrup', c.discordId, sel), `Subir ${ATTR_LABEL[sel]}`, ButtonStyle.Success, !cost.ok), linkBtn(siteLink(SITE_PATHS.atributos), 'Atributos no site')),
        );
      }
      return { files: [], blocks };
    }
    case 'linhagem': {
      if (!v.lineage) return { files: [], blocks: [text('### Linhagem\nSem linhagem. Use /girar para o giro gratuito.')] };
      const mark = { comprado: '[x]', disponivel: '[ ]', bloqueado: '[-]', despertar_pendente: '[D]' } as const;
      const byBranch = new Map<string, string[]>();
      for (const n of v.tree) {
        const key = n.branchName ?? 'Nó inicial';
        const extra = n.node.cost ? ` · ${n.node.cost} pt` : ' · grátis';
        (byBranch.get(key) ?? byBranch.set(key, []).get(key)!).push(`\`${mark[n.state]}\` ${n.node.name}${extra}`);
      }
      const lines = [...byBranch.entries()].map(([b, xs]) => `**${b}**\n${xs.join('\n')}`);
      return {
        files: [],
        blocks: [
          text(`### ${v.lineage.name} · ${RARITY_LABEL[v.lineage.rarity]}\nPontos de Linhagem livres: **${c.lineagePoints}**`),
          text(lines.join('\n')),
          text('-# [x] comprado · [ ] disponível · [-] bloqueado · [D] despertar pendente. Nós são comprados só no site.'),
          row(linkBtn(siteLink(SITE_PATHS.linhagem), 'Comprar nós no site')),
        ],
      };
    }
    case 'equipamentos': {
      const eq = v.items.filter((x) => x.equipped).map((x) => {
        const d = getEquipment(x.itemId);
        return `**${d.name}** +${x.level} · ${ATTR_LABEL[d.attr]} +${d.bonusByLevel[x.level]}`;
      });
      return {
        files: [],
        blocks: [
          text(`### Equipamentos\n${eq.length ? eq.join('\n') : 'Nada equipado.'}\n-# Itens no inventário: ${v.items.length}. O bônus passa do teto em no máximo +1.`),
          row(linkBtn(siteLink(SITE_PATHS.equipamentos), 'Equipar e melhorar no site')),
        ],
      };
    }
    case 'cosmeticos': {
      const owned = await prisma.cosmeticOwned.findMany({ where: { characterId: c.id } });
      const eq = [c.frameId, c.titleId, c.trailId].map((x) => findCosmetic(x)?.name).filter(Boolean);
      return {
        files: [],
        blocks: [
          text(`### Cosméticos\nEquipados: ${eq.length ? eq.map((x) => `**${x}**`).join(' · ') : 'nenhum'}\nConquistados: ${owned.length ? owned.map((o) => findCosmetic(o.cosmeticId)?.name ?? o.cosmeticId).join(', ') : 'nenhum ainda'}`),
          row(linkBtn(siteLink(SITE_PATHS.cosmeticos), 'Cosméticos no site')),
        ],
      };
    }
    case 'maestria': {
      const lines = v.mastery.slice(0, 12).map((m) => {
        const next = MASTERY.thresholds[m.level] ?? null;
        return `**${m.name}** · nível ${MASTERY.labels[m.level]} · ${m.uses} usos${next ? ` ${progressBar(m.uses, next, 8)} ${next}` : ' · máximo'}`;
      });
      return { files: [], blocks: [text(`### Maestria\n${lines.length ? lines.join('\n') : 'Nenhum uso bem-sucedido de habilidade ainda.'}`), row(linkBtn(siteLink(SITE_PATHS.maestria), 'Maestria no site'))] };
    }
  }
}

export async function profileScreen(targetDiscordId: string, viewer: string, tab: ProfileTab, selected?: AttrKey): Promise<ScreenSpec> {
  const c = await findCharacter(targetDiscordId);
  if (!c) return { accent: 'erro', blocks: [text(viewer === targetDiscordId ? 'Você ainda não tem personagem. Use /criar-personagem para começar.' : 'Esse jogador ainda não tem personagem.')] };
  const v = await profileView(c.id);
  const content = await tabContent(v, tab, viewer, selected);
  return {
    accent: v.lineage?.rarity ?? 'padrao',
    tabs: { current: tab, items: TABS.map((t) => ({ id: t.id, label: t.label, customId: cid('pf', 'tab', viewer, targetDiscordId, t.id) })) },
    blocks: content.blocks,
    files: content.files,
  };
}

on.command('perfil', async (i) => {
  const target = i.options.getUser('usuario') ?? i.user;
  await replyWithLoading(i, 'Gerando a ficha de avaliação...', () => profileScreen(target.id, i.user.id, 'resumo'));
});

on.command('atributos', async (i) => {
  await replyWithLoading(i, 'Carregando atributos...', () => profileScreen(i.user.id, i.user.id, 'atributos'), true);
});

on.component('pf', async (i, args) => {
  const [action] = args;
  if (action === 'tab') {
    const [, viewer, target, tab] = args;
    assertOwner(i, viewer);
    return updateWithLoading(i, 'Carregando...', () => profileScreen(target, viewer, tab as ProfileTab));
  }
  if (action === 'attrsel' && i.isStringSelectMenu()) {
    const [, owner] = args;
    assertOwner(i, owner);
    return updateWithLoading(i, 'Calculando custo...', () => profileScreen(owner, owner, 'atributos', i.values[0] as AttrKey));
  }
  if (action === 'attrup') {
    const [, owner, attr] = args;
    assertOwner(i, owner);
    const c = await findCharacter(owner);
    if (!c) throw new Error('sem personagem');
    await allocateAttribute(c.id, attr as AttrKey);
    return updateWithLoading(i, 'Atualizando...', async () => {
      const s = await profileScreen(owner, owner, 'atributos', attr as AttrKey);
      s.blocks.unshift(text(`-# ${ATTR_LABEL[attr as AttrKey]} subiu.`));
      return s;
    });
  }
});

on.command('loadout', async (i) => {
  await replyWithLoading(
    i,
    'Carregando loadout...',
    async () => {
      const c = await findCharacter(i.user.id);
      if (!c) return { accent: 'erro', blocks: [text('Você ainda não tem personagem. Use /criar-personagem para começar.')] };
      const v = await profileView(c.id);
      if (!v.lineage || !v.progress) return { accent: 'erro', blocks: [text('Sem linhagem. Use /girar para o giro gratuito.')] };
      const line = (id: string) => {
        const r = resolveSkill(id, v.progress!.nodes);
        const def = getSkill(id);
        return `**${def.name}**${def.kind === 'active' ? ` · fôlego ${r.stamina} · recarga ${r.cooldown}` : ' · Flow'}\n-# ${def.describe(r.params, { stamina: r.stamina, cooldown: r.cooldown })}`;
      };
      const actives = v.progress.loadoutActive.map(line);
      return {
        accent: v.lineage.rarity,
        blocks: [
          text(`### Loadout · ${v.lineage.name}`),
          text(`**Ativas**\n${actives.length ? actives.join('\n') : 'Nenhuma ativa desbloqueada ainda.'}`),
          sep(),
          text(`**Flow**\n${v.progress.loadoutFlow ? line(v.progress.loadoutFlow) : '—'}`),
          row(linkBtn(siteLink(SITE_PATHS.loadout), 'Montar loadout no site')),
        ],
      };
    },
    true,
  );
});

