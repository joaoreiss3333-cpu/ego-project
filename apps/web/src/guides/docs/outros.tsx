import {
  ATTR_LABEL,
  COSMETICS,
  EQUIPMENT,
  GACHA,
  GAME,
  LINEAGES,
  MMR,
  PROGRESSION,
  RARITIES,
  RARITY_LABEL,
  SELECTION_GROUPS,
  getEquipment,
  rankGroupForMode,
  MATCH_MODES,
} from '@ego/content';
import { eloDelta, expectedScore } from '@ego/db';
import { CosmeticPreview } from '@/components/CosmeticPreview';
import { COSMETIC_TYPE_LABEL, unlockText } from '@/lib/cosmetics';
import { pct } from '@/lib/format';
import { HBars, RateLadder } from '../figures';
import type { GuideDoc } from '../types';

// ---------------------------------------------------------------------------
const SLOT = { chuteira: 'Chuteira', caneleira: 'Caneleira' } as const;
const drops = SELECTION_GROUPS.flatMap((g) => g.stages.filter((s) => s.dropItem).map((s) => ({ s, item: getEquipment(s.dropItem!) })));
const ex = EQUIPMENT[0];
const exCap = PROGRESSION.attrMax;
const exBase = exCap;
const exFinal = (lvl: number) => Math.min(exBase + ex.bonusByLevel[lvl], Math.max(exBase, exCap + PROGRESSION.equipmentOverCap));

export const equipamentos: GuideDoc = {
  slug: 'equipamentos',
  summary: `Equipamentos somam num atributo. Um por encaixe (chuteira e caneleira). Melhoram até +2 com Ienes. O valor final nunca passa do teto da linhagem em mais de ${PROGRESSION.equipmentOverCap}.`,
  sections: [
    {
      title: 'Catálogo',
      blocks: [
        {
          table: {
            head: ['Item', 'Encaixe', 'Atributo', '+0 / +1 / +2', 'Melhorar (Ienes)'],
            rows: EQUIPMENT.map((e) => [e.name, SLOT[e.slot], ATTR_LABEL[e.attr], e.bonusByLevel.map((b) => `+${b}`).join(' / '), e.upgradeCost.map((c) => c.toLocaleString('pt-BR')).join(' / ')]),
          },
        },
      ],
    },
    {
      title: 'Regras',
      blocks: [
        { list: ['Um item equipado por encaixe. Equipar outro do mesmo encaixe guarda o anterior.', 'Melhorar é para sempre: +0 para +1, depois +1 para +2.', `Atributo final = base + bônus, limitado a teto + ${PROGRESSION.equipmentOverCap}.`] },
      ],
    },
    {
      title: 'Onde conseguir',
      blocks: [
        { table: { head: ['Item', 'Etapa', 'Chance na repetição'], rows: drops.map(({ s, item }) => [item.name, s.name, `${pct(s.dropChance, 0)}${s.boss ? ' (garantido na 1ª vitória)' : ''}`]) } },
      ],
    },
  ],
  examples: [
    {
      title: 'O limite do teto',
      figure: (
        <HBars
          title="Atributo final com o item em cada nível"
          rows={[0, 1, 2].map((l) => ({ label: `${ex.name} +${l}`, value: exFinal(l), note: exFinal(l) < exBase + ex.bonusByLevel[l] ? '(limitado)' : '' }))}
          max={PROGRESSION.attrMax + PROGRESSION.equipmentOverCap}
        />
      ),
      text: `Com ${ATTR_LABEL[ex.attr]} ${exBase} e teto ${exCap}, a ${ex.name} leva o valor a ${exFinal(0)} já no +0. Melhorar não passa de ${exCap + PROGRESSION.equipmentOverCap}. Para quem está abaixo do teto, cada nível conta inteiro.`,
    },
  ],
  faq: [
    { q: 'O bônus aparece no perfil?', a: 'Aparece. No card e na aba Atributos, a parte azul da barra é o bônus do equipamento.' },
    { q: 'Posso vender um item?', a: 'Não.' },
  ],
  related: ['atributos-e-tetos', 'modo-selecao'],
};

// ---------------------------------------------------------------------------
export const cosmeticos: GuideDoc = {
  slug: 'cosmeticos',
  summary: 'Molduras, títulos e rastros. Nenhum muda número em campo. Eles mostram o que você já fez.',
  sections: (['moldura', 'titulo', 'rastro'] as const).map((type) => ({
    title: COSMETIC_TYPE_LABEL[type].title,
    blocks: [
      COSMETIC_TYPE_LABEL[type].hint,
      {
        figure: (
          <div className="g-cos">
            {COSMETICS.filter((c) => c.type === type).map((c) => (
              <div key={c.id} className="g-cos__i">
                <div className="g-cos__p">
                  <CosmeticPreview def={c} />
                </div>
                <b>{c.name}</b>
                <span className="muted">{unlockText(c)}</span>
              </div>
            ))}
          </div>
        ),
        text: COSMETICS.filter((c) => c.type === type)
          .map((c) => `${c.name}: ${unlockText(c)}`)
          .join(' '),
      },
    ],
  })),
  examples: [],
  faq: [
    { q: 'As molduras de raridade exigem a linhagem equipada?', a: 'Não. Basta já ter obtido uma linhagem daquela raridade.' },
    { q: 'Onde equipo?', a: 'Em Inventário / Cosméticos, no site, ou com /equipar no Discord.' },
  ],
  related: ['equipamentos', 'modo-selecao'],
};

// ---------------------------------------------------------------------------
const pLegPlus = GACHA.rates.lendaria + GACHA.rates.mitica;
const pMythicInPity = GACHA.rates.mitica / (GACHA.rates.mitica + GACHA.rates.lendaria);
const atLeastOne = (p: number, n: number) => 1 - Math.pow(1 - p, n);

export const giro: GuideDoc = {
  slug: 'giro-de-linhagem',
  summary: `Um giro custa ${GACHA.cost} ${GAME.premiumCurrency.plural} (o primeiro é grátis). Um número de 0 a 1 é sorteado no servidor e define a raridade. Há garantia de Lendária ou melhor em ${GACHA.pityLegendary} giros e de Mítica em ${GACHA.pityMythic}.`,
  sections: [
    {
      title: 'Chances',
      blocks: [
        { table: { head: ['Raridade', 'Chance', 'Linhagens'], rows: RARITIES.map((r) => [RARITY_LABEL[r], pct(GACHA.rates[r], 2), LINEAGES.filter((l) => l.rarity === r).map((l) => l.name).join(', ') || '—']) } },
        { figure: <RateLadder />, text: 'Faixas do número sorteado' },
        'O número sorteado cai numa faixa. A faixa é a raridade. Dentro da raridade, a linhagem é sorteada entre as daquela raridade.',
      ],
    },
    {
      title: 'Garantias',
      blocks: [
        {
          list: [
            `**Lendária ou melhor**: o ${GACHA.pityLegendary}º giro seguido sem Lendária nem Mítica sai garantido. Nesse giro, a Mítica sai com a mesma proporção das chances normais (${pct(pMythicInPity, 1)}).`,
            `**Mítica**: o ${GACHA.pityMythic}º giro seguido sem Mítica sai garantido.`,
            'Cada contador zera quando sai a raridade dele (Mítica zera os dois).',
          ],
        },
        'Os seus contadores aparecem na aba Giro.',
      ],
    },
    {
      title: 'Aceitar ou descartar',
      blocks: [
        { list: ['Depois do giro, você decide: aceitar equipa a linhagem; descartar mantém a atual.', 'Enquanto não decidir, não dá para girar de novo.', 'O primeiro giro de quem não tem linhagem é aceito direto.', 'A árvore de cada linhagem fica salva. Voltar para uma linhagem antiga continua de onde parou.'] },
      ],
    },
    {
      title: 'Auditoria',
      blocks: ['Todo giro fica registrado com data, custo, seed, número sorteado, contadores antes do giro, se a garantia foi usada e a decisão. A tabela está na aba Giro.'],
    },
  ],
  examples: [
    {
      title: 'Quantos giros até uma Lendária?',
      figure: (
        <HBars
          title="Chance de pelo menos uma Lendária ou Mítica"
          rows={[5, 10, 20, 40].map((n) => ({ label: `${n} giros`, value: Math.round(atLeastOne(pLegPlus, n) * 100) }))
            .concat([{ label: `${GACHA.pityLegendary} giros`, value: 100 }])}
          max={100}
          unit="%"
        />
      ),
      text: `Sem contar a garantia, a chance de ao menos uma Lendária ou Mítica em 10 giros é ${pct(atLeastOne(pLegPlus, 10), 0)}; em 40, ${pct(atLeastOne(pLegPlus, 40), 0)}. Com ${GACHA.pityLegendary}, é certa.`,
    },
  ],
  faq: [
    { q: 'Saiu uma linhagem que eu já tenho. E agora?', a: 'Aceitar só volta a equipá-la, com a árvore como estava. Descartar mantém a atual.' },
    { q: 'O site pode mexer na chance?', a: 'Não. O sorteio acontece só no servidor. O site mostra o resultado e o registro.' },
  ],
  related: ['linhagens', 'arvore-e-despertares', 'orcamento-de-raridade'],
};

// ---------------------------------------------------------------------------
const deltas = [0, 100, 200, 400].map((diff) => ({ diff, win: eloDelta(MMR.start + diff, MMR.start, 1), loss: eloDelta(MMR.start + diff, MMR.start, 0), draw: eloDelta(MMR.start + diff, MMR.start, 0.5) }));

export const ranking: GuideDoc = {
  slug: 'ranking-e-temporadas',
  summary: `Ranking por servidor, em dois grupos: Solo e Time. Todo mundo começa com ${MMR.start} de MMR por temporada. Elo com K ${MMR.kFactor}, pela média de cada time.`,
  sections: [
    {
      title: 'Grupos',
      blocks: [{ table: { head: ['Modo', 'Ranking'], rows: MATCH_MODES.map((m) => [m, rankGroupForMode(m) === 'solo' ? 'Solo' : 'Time']) } }],
    },
    {
      title: 'MMR',
      blocks: [
        { list: [`Só a ranqueada mexe no MMR.`, 'A conta usa a média de MMR de cada time. Bots não entram na média.', 'Vitória vale 1, empate 0,5, derrota 0, contra o resultado esperado.', 'Partida marcada como entrega de jogo não conta.'] },
        { table: { head: ['Seu time acima por', 'Vitória', 'Empate', 'Derrota'], rows: deltas.map((d) => [d.diff, `+${d.win}`, d.draw >= 0 ? `+${d.draw}` : d.draw, d.loss]) } },
        `Contra um time de mesmo MMR, a chance esperada é ${pct(expectedScore(MMR.start, MMR.start), 0)}: vencer dá +${deltas[0].win}.`,
      ],
    },
    {
      title: 'Fila',
      blocks: [`A fila ranqueada procura adversários a até ${MMR.queueInitialRange} de MMR e abre a busca ${MMR.queueRangeGrowthPerMinute} por minuto de espera.`],
    },
    {
      title: 'Temporadas',
      blocks: ['A temporada tem nome e data de fim, mostrados na aba Ranking. No fim, a tabela é congelada e a próxima começa com todo mundo de novo em ' + MMR.start + '.', 'Empate de MMR na tabela: fica na frente quem tem mais vitórias.'],
    },
  ],
  examples: [
    {
      title: 'Zebra vale mais',
      figure: (
        <HBars
          title="MMR ganho por vitória"
          rows={[0, 100, 200, 400].map((diff) => ({ label: `Adversário +${diff}`, value: eloDelta(MMR.start, MMR.start + diff, 1) }))}
          max={MMR.kFactor}
        />
      ),
      text: `Vencer um time ${400} acima de você rende +${eloDelta(MMR.start, MMR.start + 400, 1)}. Vencer um time igual, +${deltas[0].win}.`,
    },
  ],
  faq: [
    { q: 'Casual mexe no ranking?', a: 'Não.' },
    { q: 'O ranking é global?', a: 'Não. Cada servidor tem a sua tabela.' },
  ],
  related: ['recompensas-de-partida', 'modos-e-campos', 'orcamento-de-raridade'],
};

