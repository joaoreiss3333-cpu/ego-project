import {
  ACTION_LABEL,
  ATTRS,
  ATTR_LABEL,
  ATTR_SHORT,
  AWAKENING_MISSIONS,
  COLORS,
  GAME,
  LINEAGES,
  MASTERY,
  MATCH_REWARDS,
  MATCH_RULES as R,
  POSITION_LABEL,
  PROGRESSION,
  RARITY_COLORS,
  RARITY_LABEL,
  TRAINING_REWARDS,
  allSkills,
  allTreeNodes,
  getSkill,
  tokenCostForAttr,
  xpForLevel,
  type SkillDef,
  type SkillRequirement,
} from '@ego/content';
import { NO_LINEAGE_CAP, tokensSpentFor } from '@ego/db';
import { hintAccuracy } from '@ego/engine';
import { FieldDiagram } from '@/components/field/FieldDiagram';
import { LineagePortrait, SkillIcon } from '@/components/ui';
import { pct } from '@/lib/format';
import { MAX_ACTIVE } from '@/lib/loadout-rules';
import { rewardText } from '@/lib/rewards';
import { NODE_TYPE_LABEL } from '@/lib/tree';
import { Curve, MiniTree } from '../figures';
import { DRIBBLES_PER_TOKEN, TACKLES_PER_TOKEN, moveRange } from '../data';
import type { GuideDoc } from '../types';

const sk = (id: string) => getSkill(id);
const lineageName = (id: string) => LINEAGES.find((l) => l.id === id)?.name ?? id;

// ---------------------------------------------------------------------------
function CapsChart() {
  const cw = 70;
  const rh = 46;
  const lw = 130;
  const w = lw + ATTRS.length * cw + 10;
  const h = 30 + LINEAGES.length * rh;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Tetos de atributo por linhagem" className="g-chart">
      {ATTRS.map((k, i) => (
        <text key={k} x={lw + i * cw + cw / 2} y={16} textAnchor="middle" className="g-chart__t">
          {ATTR_SHORT[k]}
        </text>
      ))}
      {LINEAGES.map((l, r) => (
        <g key={l.id}>
          <text x={0} y={30 + r * rh + rh / 2 + 5} className="g-chart__l" style={{ fill: RARITY_COLORS[l.rarity] }}>
            {l.name.toUpperCase()}
          </text>
          {ATTRS.map((k, i) => {
            const v = l.caps[k];
            const bh = ((rh - 12) * v) / PROGRESSION.attrMax;
            return (
              <g key={k}>
                <rect x={lw + i * cw + 12} y={30 + r * rh + 4} width={cw - 24} height={rh - 12} fill={COLORS.line} />
                <rect x={lw + i * cw + 12} y={30 + r * rh + 4 + (rh - 12 - bh)} width={cw - 24} height={bh} fill={v >= PROGRESSION.attrMax ? '#FFFFFF' : RARITY_COLORS[l.rarity]} fillOpacity={0.85} />
                <text x={lw + i * cw + cw / 2} y={30 + r * rh + rh / 2 + 6} textAnchor="middle" className="g-chart__v" style={{ fill: '#070B12' }}>
                  {v}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

const hintVis = Array.from({ length: PROGRESSION.attrMax }, (_, i) => i + 1).filter((v) => hintAccuracy(v) > 0);

export const atributos: GuideDoc = {
  slug: 'atributos-e-tetos',
  summary: `Sete atributos. Todos começam em ${PROGRESSION.attrStart} e vão até ${PROGRESSION.attrMax}, limitados pelo teto da linhagem. Até ${PROGRESSION.freeUpTo}, subir custa só 1 ponto; acima disso, custa também Fichas de Treino.`,
  sections: [
    {
      title: 'O que cada atributo faz',
      blocks: [
        {
          table: {
            head: ['Atributo', 'Onde entra'],
            rows: [
              [ATTR_LABEL.velocidade, `Alcance (${R.movement.base} + Velocidade ÷ ${R.movement.velocityDivisor}), iniciativa e disputa de bola solta contra o goleiro.`],
              [ATTR_LABEL.drible, `Duelos quando você escolhe ${ACTION_LABEL.driblar} ou ${ACTION_LABEL.conduzir}.`],
              [ATTR_LABEL.passe, 'Rolagem do passe. Metade do Passe é a distância que você passa sem penalidade.'],
              [ATTR_LABEL.chute, 'Rolagem do chute (e do duelo, se você for pego chutando).'],
              [ATTR_LABEL.fisico, `Duelos com ${ACTION_LABEL.proteger}, bloqueio de ${sk('corpo_elastico').name} e, para goleiros, metade da defesa.`],
              [ATTR_LABEL.visao, 'Para goleiros, a outra metade da defesa. Nos treinos de duelo, Visão alta mostra a tendência do bot.'],
              [ATTR_LABEL.defesa, 'Duelos defendendo e interceptação de passes.'],
            ],
          },
        },
      ],
    },
    {
      title: 'Tetos',
      blocks: [
        `Cada linhagem tem um teto por atributo. Sem linhagem, o teto de tudo é ${NO_LINEAGE_CAP}.`,
        { figure: <CapsChart />, text: 'Tetos por linhagem' },
        `Equipamentos somam por cima, mas o valor final nunca passa do teto em mais de ${PROGRESSION.equipmentOverCap}. Com teto ${PROGRESSION.attrMax}, dá para chegar a ${PROGRESSION.attrMax + PROGRESSION.equipmentOverCap}.`,
      ],
    },
    {
      title: 'Subir um atributo',
      blocks: [
        { table: { head: ['Subir para', 'Pontos de Atributo', 'Fichas do atributo'], rows: Array.from({ length: PROGRESSION.attrMax - PROGRESSION.attrStart }, (_, i) => PROGRESSION.attrStart + 1 + i).map((t) => [t, 1, tokenCostForAttr(t) || '—']) } },
        'Cada atributo usa as próprias fichas: subir Chute gasta Fichas de Chute. Veja [[fichas-de-treino]].',
        { h: 'Reset' },
        `Na aba Atributos: custa ${PROGRESSION.reset.attributesCost.toLocaleString('pt-BR')} ${GAME.commonCurrency.plural}, volta tudo para ${PROGRESSION.attrStart} e devolve os pontos e as fichas gastas. Uma vez a cada ${PROGRESSION.reset.cooldownHours} horas.`,
      ],
    },
    {
      title: 'Treino e Visão',
      blocks: [
        `Nos treinos de drible e desarme, a partir de Visão ${hintVis[0]} aparece uma dica da escolha do bot. A dica acerta com esta frequência:`,
        { table: { head: ['Visão', ...hintVis.map(String)], rows: [['Acerto da dica', ...hintVis.map((v) => pct(hintAccuracy(v), 0))]] } },
      ],
    },
  ],
  examples: [
    {
      title: 'Velocidade na prática',
      figure: (
        <FieldDiagram
          title="Alcance com Velocidade 4 e 8"
          tokens={[
            { x: 2, y: 2, team: 'A', n: 4, tag: 'VEL 4' },
            { x: 2, y: 4, team: 'A', n: 8, tag: 'VEL 8' },
          ]}
          arrows={[
            { from: [2, 2], to: [2 + moveRange(4), 2], team: 'A', label: `${moveRange(4)} casas` },
            { from: [2, 4], to: [2 + moveRange(8), 4], team: 'A', label: `${moveRange(8)} casas` },
          ]}
        />
      ),
      text: `Com Velocidade 4, ${moveRange(4)} casas. Com 8, ${moveRange(8)}. O salto acontece a cada ${R.movement.velocityDivisor} pontos.`,
    },
  ],
  faq: [
    { q: 'Qual atributo subir primeiro?', a: 'O que a sua linhagem tem de teto alto e o seu papel usa. Um atacante rápido sente cada ponto de Velocidade a cada múltiplo de ' + R.movement.velocityDivisor + '.' },
    { q: 'Trocar de linhagem muda meus atributos?', a: 'Os valores ficam. Os tetos mudam; se o novo teto for menor, você não sobe mais aquele atributo até trocar de novo.' },
  ],
  related: ['niveis-e-pontos', 'fichas-de-treino', 'linhagens'],
};

// ---------------------------------------------------------------------------
const lvls = Array.from({ length: PROGRESSION.maxLevel - 1 }, (_, i) => i + 1);
const cumulative = (to: number) => lvls.filter((l) => l < to).reduce((a, l) => a + xpForLevel(l), 0);
const sampleLvls = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, PROGRESSION.maxLevel - 1].filter((v, i, a) => v >= 1 && v < PROGRESSION.maxLevel && a.indexOf(v) === i);

export const niveis: GuideDoc = {
  slug: 'niveis-e-pontos',
  summary: `Nível vai até ${PROGRESSION.maxLevel}. Cada nível dá ${PROGRESSION.attributePointsPerLevel} Ponto de Atributo; a cada ${PROGRESSION.lineagePointEvery} níveis, 1 Ponto de Linhagem para a árvore.`,
  sections: [
    {
      title: 'XP por nível',
      blocks: [
        'O XP para passar do nível N para o seguinte é 100 x N elevado a 1,35, arredondado.',
        { table: { head: ['Nível', 'XP para o próximo', 'XP acumulado até aqui'], rows: sampleLvls.map((l) => [l, xpForLevel(l).toLocaleString('pt-BR'), cumulative(l).toLocaleString('pt-BR')]) } },
        { figure: <Curve title="XP para o próximo nível" points={lvls.map((l) => [l, xpForLevel(l)])} xLabel="nível" yLabel="XP" marks={[10, 20, 30, 40]} />, text: 'Curva de XP por nível.' },
        `Do nível 1 ao ${PROGRESSION.maxLevel}: ${cumulative(PROGRESSION.maxLevel).toLocaleString('pt-BR')} XP no total.`,
      ],
    },
    {
      title: 'Pontos',
      blocks: [
        { list: [`**Pontos de Atributo**: ${PROGRESSION.attributePointsPerLevel} por nível. No nível N você já ganhou N - 1.`, `**Pontos de Linhagem**: 1 em cada nível par. Servem para comprar nós da árvore ([[arvore-e-despertares]]).`] },
        'Os Pontos de Linhagem são seus, não da linhagem: se trocar de linhagem, o que sobrou vai junto.',
      ],
    },
    {
      title: 'De onde vem XP',
      blocks: [
        {
          list: [
            `Partidas: ${MATCH_REWARDS.perActiveTurn.xp} por lance com ação própria, ${MATCH_REWARDS.goal.xp} por gol, ${MATCH_REWARDS.win.xp} pela vitória ([[recompensas-de-partida]]).`,
            `Treinos: ${TRAINING_REWARDS.drible.xp} a ${TRAINING_REWARDS['1v1'].xpWin} ([[treinos]]).`,
            'Missões e Modo Seleção ([[missoes]], [[modo-selecao]]).',
          ],
        },
      ],
    },
  ],
  examples: [
    {
      title: 'Subindo do 9 para o 10',
      figure: <Curve title="XP acumulado" points={lvls.slice(0, 20).map((l) => [l, cumulative(l + 1)])} xLabel="nível" yLabel="XP acumulado" marks={[10]} />,
      text: `No nível 9 você precisa de ${xpForLevel(9).toLocaleString('pt-BR')} XP para o 10. Chegando no 10 (nível par), ganha 1 Ponto de Atributo e 1 Ponto de Linhagem.`,
    },
  ],
  faq: [
    { q: 'O XP que sobra se perde?', a: 'Não. Passa para o nível seguinte, até o máximo.' },
    { q: 'No nível máximo, o XP continua?', a: 'Não conta mais. O resto da recompensa (moedas, fichas) continua vindo.' },
  ],
  related: ['atributos-e-tetos', 'arvore-e-despertares'],
};

// ---------------------------------------------------------------------------
export const fichas: GuideDoc = {
  slug: 'fichas-de-treino',
  summary: `Fichas de Treino existem para cada atributo. Até ${PROGRESSION.freeUpTo}, você sobe atributos só com pontos. Acima, cada degrau pede ${PROGRESSION.tokensPerStep} fichas a mais que o anterior.`,
  sections: [
    {
      title: 'Custo',
      blocks: [
        `Para chegar em N (acima de ${PROGRESSION.freeUpTo}): (N - ${PROGRESSION.freeUpTo}) x ${PROGRESSION.tokensPerStep} fichas daquele atributo, além do Ponto de Atributo.`,
        {
          table: {
            head: ['Valor', 'Fichas neste degrau', 'Fichas desde o ' + PROGRESSION.freeUpTo],
            rows: Array.from({ length: PROGRESSION.attrMax - PROGRESSION.freeUpTo }, (_, i) => PROGRESSION.freeUpTo + 1 + i).map((v) => [v, tokenCostForAttr(v), tokensSpentFor(v)]),
          },
        },
      ],
    },
    {
      title: 'De onde vêm',
      blocks: [
        {
          table: {
            head: ['Fonte', 'Fichas'],
            rows: [
              ['Treino de drible', `${TRAINING_REWARDS.drible.tokensPerHit} de Drible por acerto`],
              ['Treino de desarme', `${TRAINING_REWARDS.desarme.tokensPerHit} de Defesa por acerto`],
              ['Treino físico', `${TRAINING_REWARDS.fisico.tokensBase} de Velocidade e de Físico, +${TRAINING_REWARDS.fisico.tokensBonusPerRoundSaved} por rodada poupada`],
              ['Treino 1v1', `${TRAINING_REWARDS['1v1'].tokensPerGoal} de Chute por gol (+1), ${TRAINING_REWARDS['1v1'].visionTokensBase} de Visão (+1 por jogada de visão)`],
              ['Partida: passes', `${MATCH_REWARDS.passTokensPerCompletedPass} de Passe por passe certo, ${MATCH_REWARDS.assist.passTokens} por assistência, até ${MATCH_REWARDS.maxPassTokensPerMatch}`],
              ['Partida: dribles', `1 de Drible a cada ${DRIBBLES_PER_TOKEN} dribles vencidos`],
              ['Partida: desarmes', `1 de Defesa a cada ${TACKLES_PER_TOKEN} desarmes`],
              ['Modo Seleção', 'Primeira vitória de várias etapas'],
            ],
          },
        },
        'As fichas de partida sofrem as mesmas travas das outras recompensas ([[limites-diarios]]).',
      ],
    },
    {
      title: 'Outros usos',
      blocks: ['Alguns cosméticos são criados com fichas ([[cosmeticos]]). No reset de atributos, as fichas gastas voltam.'],
    },
  ],
  examples: [
    {
      title: 'Levando Chute de 6 a 9',
      figure: (
        <div className="g-steps">
          {[7, 8, 9].map((v) => (
            <div key={v} className="g-steps__i">
              <span className="label">Para {v}</span>
              <span className="num">{tokenCostForAttr(v)}</span>
              <span className="t-mono muted">fichas + 1 pt</span>
            </div>
          ))}
          <div className="g-steps__i g-steps__i--total">
            <span className="label">Total</span>
            <span className="num">{tokensSpentFor(9) - tokensSpentFor(6)}</span>
            <span className="t-mono muted">fichas + 3 pts</span>
          </div>
        </div>
      ),
      text: `De 6 para 9 em Chute: ${tokenCostForAttr(7)} + ${tokenCostForAttr(8)} + ${tokenCostForAttr(9)} = ${tokensSpentFor(9) - tokensSpentFor(6)} Fichas de Chute e 3 Pontos de Atributo.`,
    },
  ],
  faq: [
    { q: 'Posso trocar ficha de um atributo por outro?', a: 'Não. Cada atributo tem as suas.' },
    { q: 'Fichas somem com o tempo?', a: 'Não.' },
  ],
  related: ['treinos', 'atributos-e-tetos', 'recompensas-de-partida'],
};

// ---------------------------------------------------------------------------
function reqText(r: SkillRequirement): string {
  const acts = (xs?: string[]) => (xs?.length ? ` (${xs.map((a) => ACTION_LABEL[a as keyof typeof ACTION_LABEL] ?? a).join(', ')})` : '');
  switch (r.kind) {
    case 'any':
      return 'Qualquer situação';
    case 'withBall':
      return `Com a bola${acts(r.actions)}`;
    case 'withoutBall':
      return `Sem a bola${acts(r.actions)}`;
    case 'defending':
      return `Defendendo${acts(r.actions)}`;
  }
}

function SkillSheet({ s }: { s: SkillDef }) {
  return (
    <div className="g-skill">
      <SkillIcon lineageId={s.lineageId} skillId={s.id} size={56} alt={s.name} />
      <div className="stack stack--tight">
        <div className="row" style={{ gap: 6 }}>
          <b className="g-skill__name">{s.name}</b>
          <span className="tag">{s.kind === 'flow' ? 'Flow' : 'Ativa'}</span>
          {s.reaction ? (
            <span className="tag" style={{ ['--tc' as string]: 'var(--success)' }}>
              Reação
            </span>
          ) : null}
          {s.kind === 'active' ? (
            <span className="t-mono muted" style={{ fontSize: 12 }}>
              FOL {s.stamina} · REC {s.cooldown}
            </span>
          ) : null}
        </div>
        <p className="g-skill__text">{s.describe(s.params, { stamina: s.stamina, cooldown: s.cooldown })}</p>
        <p className="g-skill__meta">
          <span className="label">Quando</span> {reqText(s.requirement)} · <span className="label">Contra-jogo</span> {s.counterplay}
        </p>
      </div>
    </div>
  );
}

export const linhagens: GuideDoc = {
  slug: 'linhagens',
  summary: `${LINEAGES.length} linhagens, de ${RARITY_LABEL.comum} a ${RARITY_LABEL.mitica}. A linhagem define os tetos dos atributos, as habilidades e a árvore. Raridade maior não é só mais forte: custa mais no orçamento da ranqueada.`,
  sections: LINEAGES.map((l) => ({
    title: `${l.name} · ${RARITY_LABEL[l.rarity]}`,
    blocks: [
      {
        figure: (
          <div className="g-lin" style={{ ['--rc' as string]: RARITY_COLORS[l.rarity] }}>
            <LineagePortrait lineageId={l.id} size={132} alt={l.name} />
            <div className="stack stack--tight">
              <span className="g-lin__tag">{l.tagline}</span>
              <p className="ink-2" style={{ margin: 0 }}>
                {l.description}
              </p>
              <span className="t-mono muted" style={{ fontSize: 12 }}>
                Posição natural: {POSITION_LABEL[l.naturalPosition]} · {l.playstyle.summary}
              </span>
              <div className="g-lin__caps">
                {ATTRS.map((k) => (
                  <span key={k}>
                    <em>{ATTR_SHORT[k]}</em>
                    <b>{l.caps[k]}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ),
        text: `${l.name} ${l.tagline} ${l.description} ${l.playstyle.summary}`,
      },
      {
        figure: (
          <div className="stack">
            {l.skills.map((s) => (
              <SkillSheet key={s.id} s={s} />
            ))}
          </div>
        ),
        text: l.skills.map((s) => `${s.name}: ${s.describe(s.params, { stamina: s.stamina, cooldown: s.cooldown })} ${s.counterplay}`).join(' '),
      },
    ],
  })),
  examples: [
    {
      title: `${sk('faixa_aceleracao').name} com passe na trilha`,
      figure: (
        <FieldDiagram
          title="Faixa de Aceleração"
          tokens={[
            { x: 3, y: 1, team: 'A', ghost: true },
            { x: 7, y: 1, team: 'A', n: 11, tag: 'CHIGIRI' },
            { x: 4, y: 4, team: 'A', n: 8, ball: true },
            { x: 5, y: 2, team: 'B', n: 4 },
          ]}
          marks={[4, 5, 6, 7].map((x) => ({ x, y: 1, tone: 'amber' as const }))}
          zones={[{ x: 5, y: 2, r: 1, team: 'B' }]}
          arrows={[
            { from: [3, 1], to: [7, 1], team: 'A' },
            { from: [4, 4], to: [7, 1], kind: 'pass', label: 'sem corte' },
          ]}
        />
      ),
      text: `Chigiri corre ${sk('faixa_aceleracao').params.minCells} casas em linha reta pela ponta e deixa a trilha. O passe do 8 termina na trilha: o 4 está na linha, mas não pode interceptar.`,
    },
  ],
  faq: [
    { q: 'Posso ter várias linhagens?', a: 'Pode guardar várias. Só uma fica equipada. O progresso da árvore de cada uma fica salvo.' },
    { q: 'Como troco de linhagem?', a: 'Pelo giro: aceitar um resultado equipa aquela linhagem ([[giro-de-linhagem]]).' },
  ],
  related: ['arvore-e-despertares', 'giro-de-linhagem', 'orcamento-de-raridade'],
};

// ---------------------------------------------------------------------------
const isagi = LINEAGES.find((l) => l.id === 'isagi') ?? LINEAGES[LINEAGES.length - 1];

export const arvore: GuideDoc = {
  slug: 'arvore-e-despertares',
  summary: 'Cada linhagem tem uma árvore: um nó inicial grátis com o Flow e ramos com habilidades, evoluções e Despertares. Você compra nós com Pontos de Linhagem, e só no site.',
  sections: [
    {
      title: 'Tipos de nó',
      blocks: [
        {
          list: [
            `**${NODE_TYPE_LABEL.flow_start}**: grátis, já vem com a linhagem. Dá a habilidade de Flow.`,
            `**${NODE_TYPE_LABEL.skill}**: libera uma habilidade ativa ou de Flow.`,
            `**${NODE_TYPE_LABEL.evolution}**: melhora os números de uma habilidade que você já tem.`,
            `**${NODE_TYPE_LABEL.awakening}**: o nó mais forte do ramo. Além dos pontos, exige uma missão de Despertar concluída.`,
          ],
        },
        'Cada ramo é uma fila: para comprar um nó, compre antes o anterior do mesmo ramo. O primeiro nó de cada ramo sai direto do inicial.',
      ],
    },
    {
      title: 'Comprar',
      blocks: [
        'Na aba **Personagem / Linhagem**, clique no nó e em Liberar. O nó acende na hora.',
        `Uma habilidade ativa nova entra sozinha no loadout se ainda houver espaço entre as ${MAX_ACTIVE}.`,
        'A árvore é da linhagem: trocar de linhagem não apaga nada, e voltar para ela continua de onde parou.',
        `Reset: ${PROGRESSION.reset.treeCost.toLocaleString('pt-BR')} ${GAME.commonCurrency.plural}, devolve os Pontos de Linhagem da linhagem equipada e volta o loadout ao padrão. Uma vez a cada ${PROGRESSION.reset.cooldownHours} horas.`,
      ],
    },
    {
      title: 'Despertares',
      blocks: [
        { table: { head: ['Missão', 'Linhagem', 'Objetivo', 'Recompensa'], rows: AWAKENING_MISSIONS.map((m) => [m.name, lineageName(m.lineageId ?? ''), m.description, rewardText(m.reward)]) } },
        'A missão só conta com a linhagem certa equipada. O progresso aparece em **Progresso / Despertares** e no próprio nó.',
      ],
    },
    {
      title: 'Todas as árvores',
      blocks: [
        {
          table: {
            head: ['Linhagem', 'Nó', 'Tipo', 'Custo (PL)', 'Exige'],
            rows: LINEAGES.flatMap((l) =>
              allTreeNodes(l).map((n) => [l.name, n.name, NODE_TYPE_LABEL[n.type], n.cost, n.requires ? (allTreeNodes(l).find((x) => x.id === n.requires)?.name ?? '') : n.type === 'flow_start' ? '—' : 'Inicial']),
            ),
          },
        },
      ],
    },
  ],
  examples: [
    {
      title: `A árvore de ${isagi.name}`,
      figure: <MiniTree lineage={isagi} />,
      text: `${isagi.name} tem ${isagi.branches.length} ramos. O Despertar do ramo de finalização exige a missão ${AWAKENING_MISSIONS.find((m) => m.lineageId === isagi.id)?.name ?? ''}.`,
    },
  ],
  faq: [
    { q: 'Posso comprar pelo bot?', a: 'Não. Só no site.' },
    { q: 'Os Pontos de Linhagem são por linhagem?', a: 'Não. São do personagem. O reset devolve só os da linhagem equipada.' },
  ],
  related: ['linhagens', 'loadout', 'niveis-e-pontos'],
};

// ---------------------------------------------------------------------------
export const loadout: GuideDoc = {
  slug: 'loadout',
  summary: `O loadout é o que vai para o campo: até ${MAX_ACTIVE} habilidades ativas e 1 de Flow, entre as liberadas na árvore da linhagem equipada.`,
  sections: [
    {
      title: 'Regras',
      blocks: [
        { list: [`Até ${MAX_ACTIVE} ativas, sem repetir.`, 'Exatamente 1 Flow.', 'Só habilidades liberadas na árvore da linhagem equipada.', 'O loadout é salvo por linhagem.'] },
        'Builds: guarde combinações com nome e aplique com um clique na aba Loadout. Cada linhagem tem as suas.',
      ],
    },
    {
      title: 'Quando cada habilidade pode ser usada',
      blocks: [
        'No planejamento, uma habilidade só aparece como opção quando a situação combina:',
        { table: { head: ['Habilidade', 'Linhagem', 'Situação'], rows: allSkills().map((s) => [s.name, lineageName(s.lineageId), reqText(s.requirement)]) } },
        'Ativa também exige recarga pronta e fôlego suficiente. Flow exige a barra cheia.',
      ],
    },
  ],
  examples: [
    {
      title: 'Um loadout de ponta',
      figure: (
        <div className="g-loadout">
          {['faixa_aceleracao', 'chute_velocidade', 'arranque_tardio', 'pantera_vermelha'].map((id) => {
            const s = sk(id);
            return (
              <div key={id} className="g-loadout__slot">
                <SkillIcon lineageId={s.lineageId} skillId={id} size={64} alt={s.name} />
                <b>{s.name}</b>
                <span className="t-mono muted">{s.kind === 'flow' ? 'FLOW' : `FOL ${s.stamina}`}</span>
              </div>
            );
          })}
        </div>
      ),
      text: `Um Chigiri de ponta: ${sk('faixa_aceleracao').name} abre o corredor, ${sk('chute_velocidade').name} finaliza em velocidade, ${sk('arranque_tardio').name} ataca a sobra e ${sk('pantera_vermelha').name} decide o lance.`,
    },
  ],
  faq: [
    { q: 'Mudei o loadout no meio da partida. Vale?', a: 'O loadout é lido na montagem da partida. A mudança vale a partir da próxima.' },
    { q: 'Posso levar habilidade de outra linhagem?', a: 'Não. Só da linhagem equipada. Isagi copia com Devorar, mas é outra história.' },
  ],
  related: ['arvore-e-despertares', 'maestria', 'flow'],
};

// ---------------------------------------------------------------------------
const ARMED = ['tackle_bonus', 'cover_ally', 'shot_block', 'direct_shot', 'speed_shot', 'curve_pass', 'samba', 'accel_trail', 'puzzle_piece'];
const armedNames = allSkills()
  .filter((s) => ARMED.includes(s.effect))
  .map((s) => s.name);

export const maestria: GuideDoc = {
  slug: 'maestria',
  summary: `Cada uso bem-sucedido de uma habilidade conta para a maestria dela. São ${MASTERY.thresholds.length} níveis. Cada nível tira ${MASTERY.staminaReductionPerLevel} do custo de fôlego.`,
  sections: [
    {
      title: 'Níveis',
      blocks: [
        { table: { head: ['Nível', 'Usos', 'Fôlego'], rows: MASTERY.thresholds.map((t, i) => [MASTERY.labels[i + 1], t, `-${(i + 1) * MASTERY.staminaReductionPerLevel}`]) } },
        { list: [`No nível ${MASTERY.labels[MASTERY.visualLevel]}, a seta e o efeito mudam no campo.`, `No nível ${MASTERY.labels[MASTERY.suffixLevel]}, o nome ganha "${MASTERY.suffix}" no log da partida.`] },
      ],
    },
    {
      title: 'O que conta como uso',
      blocks: [
        'Só usos bem-sucedidos. Ativar e não acontecer nada não conta.',
        `Estas habilidades "armam" ao serem escolhidas (pagam custo e recarga), mas só contam quando o efeito acontece: ${armedNames.join(', ')}.`,
        'A maestria é somada no fim de cada partida: casual, ranqueada ou Modo Seleção.',
      ],
    },
  ],
  examples: [
    {
      title: `${sk('arrancada').name} ao longo da temporada`,
      figure: (
        <div className="g-steps">
          {MASTERY.thresholds.map((t, i) => (
            <div key={t} className={`g-steps__i${i === MASTERY.thresholds.length - 1 ? ' g-steps__i--total' : ''}`}>
              <span className="label">{MASTERY.labels[i + 1]} · {t} usos</span>
              <span className="num">{Math.max(0, sk('arrancada').stamina - (i + 1) * MASTERY.staminaReductionPerLevel)}</span>
              <span className="t-mono muted">de fôlego</span>
            </div>
          ))}
        </div>
      ),
      text: `${sk('arrancada').name} custa ${sk('arrancada').stamina}. No nível ${MASTERY.labels[MASTERY.thresholds.length]}, custa ${Math.max(0, sk('arrancada').stamina - MASTERY.thresholds.length * MASTERY.staminaReductionPerLevel)}.`,
    },
  ],
  faq: [
    { q: 'Maestria de Flow serve para alguma coisa?', a: 'Flow não custa fôlego, mas conta para o visual e para o sufixo no log.' },
    { q: 'Trocar de linhagem zera a maestria?', a: 'Não. A maestria é da habilidade e fica guardada.' },
  ],
  related: ['loadout', 'folego'],
};
