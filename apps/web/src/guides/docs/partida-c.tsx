import {
  COLORS,
  DEFAULT_RARITY_BUDGET,
  FIELD_SIZES,
  LINEAGES,
  MASTERY,
  MATCH_MODES,
  MATCH_RULES as R,
  PLAYERS_PER_SIDE,
  RARITIES,
  RARITY_COST,
  RARITY_LABEL,
  allSkills,
  getSkill,
  rankGroupForMode,
  type LineageDef,
  type MatchMode,
} from '@ego/content';
import { goalRows, kickoffPositions, type MatchSetup } from '@ego/engine';
import { FieldDiagram, type FieldToken } from '@/components/field/FieldDiagram';
import { FlowGauge, HBars } from '../figures';
import type { GuideDoc } from '../types';

const sk = (id: string) => getSkill(id);
const actives = allSkills().filter((s) => s.kind === 'active');
const flows = allSkills().filter((s) => s.kind === 'flow');
const lineageName = (id: string) => LINEAGES.find((l) => l.id === id)?.name ?? id;

// ---------------------------------------------------------------------------
const arr = sk('arrancada');
const exStart = R.stamina.max;
const exSpent = R.stamina.sprintCost + arr.stamina;
const exEnd = Math.min(R.stamina.max, exStart - exSpent + R.stamina.regenPerTurn);

export const folego: GuideDoc = {
  slug: 'folego',
  summary: `Fôlego vai de 0 a ${R.stamina.max}. Sprint, Bote e habilidades ativas gastam. Todo lance devolve ${R.stamina.regenPerTurn}. Abaixo de ${R.stamina.lowThreshold}, você perde ${R.stamina.lowPenalty} em todas as rolagens.`,
  sections: [
    {
      title: 'O que gasta',
      blocks: [
        { list: [`**Sprint**: ${R.stamina.sprintCost}.`, `**Bote**: ${R.stamina.boteCost}.`, '**Habilidade ativa**: o custo dela (lista abaixo).', 'Habilidades de Flow não custam fôlego.'] },
        {
          figure: (
            <HBars
              title="Custo de fôlego"
              rows={[
                { label: 'Sprint', value: R.stamina.sprintCost, color: COLORS.muted },
                { label: 'Bote', value: R.stamina.boteCost, color: COLORS.muted },
                ...actives
                  .slice()
                  .sort((a, b) => b.stamina - a.stamina)
                  .map((s) => ({ label: `${s.name} (${lineageName(s.lineageId)})`, value: s.stamina })),
              ]}
              max={R.stamina.max / 2}
            />
          ),
          text: 'Custo de fôlego de sprint, bote e cada habilidade ativa.',
        },
        `Os custos acima são os de base. Evoluções da árvore podem baixar o custo, e cada nível de maestria tira ${MASTERY.staminaReductionPerLevel} ([[maestria]]).`,
        'Tudo é pago no começo da resolução. Se o plano custa mais do que você tem, ele não é aceito.',
      ],
    },
    {
      title: 'Recuperação',
      blocks: [
        `No fim de todo lance, cada jogador recupera ${R.stamina.regenPerTurn}, até o máximo de ${R.stamina.max}.`,
        `${sk('folego_inesgotavel').name} (Flow do Kuon) enche o fôlego na hora.`,
      ],
    },
    {
      title: 'Fôlego baixo',
      blocks: [`Com menos de ${R.stamina.lowThreshold}, todas as suas rolagens (duelo, passe, chute, interceptação) levam -${R.stamina.lowPenalty}. Planeje o lance seguinte antes de gastar tudo.`],
    },
  ],
  examples: [
    {
      title: `Sprint com ${arr.name}`,
      figure: (
        <FieldDiagram
          title="Sprint e Arrancada no mesmo lance"
          tokens={[
            { x: 2, y: 3, team: 'A', ghost: true },
            { x: 9, y: 3, team: 'A', n: 6, tag: `FOL ${exStart - exSpent}` },
            { x: 8, y: 1, team: 'B', n: 11, ball: true },
          ]}
          arrows={[{ from: [2, 3], to: [9, 3], team: 'A', label: `sprint + ${arr.name.toLowerCase()}` }]}
        />
      ),
      text: `O 6 começa com ${exStart}. Sprint (${R.stamina.sprintCost}) + ${arr.name} (${arr.stamina}) = ${exSpent}. Ele termina o movimento com ${exStart - exSpent} e, no fim do lance, recupera ${R.stamina.regenPerTurn}: fica com ${exEnd}.`,
    },
  ],
  faq: [
    { q: 'Fôlego volta no intervalo?', a: `Não há recarga especial. Cada lance devolve ${R.stamina.regenPerTurn}, inclusive o último do tempo.` },
    { q: 'Bote sem fôlego?', a: `O Bote cobra ${R.stamina.boteCost}. Se o plano inteiro não couber no seu fôlego, ele vira ficar parado.` },
  ],
  related: ['flow', 'movimento-e-iniciativa', 'maestria'],
};

// ---------------------------------------------------------------------------
const gains = [
  { label: 'drible vencido', value: R.flow.dribbleWon },
  { label: 'leitura certa', value: R.flow.readCorrect },
  { label: 'gol', value: R.flow.goal },
  { label: 'defesa do goleiro', value: R.flow.goalkeeperSave },
];

export const flow: GuideDoc = {
  slug: 'flow',
  summary: `Flow é a barra especial. Ela enche jogando bem e, cheia (${R.flow.max}), libera a habilidade de Flow do seu loadout por um lance. Usou, zera.`,
  sections: [
    {
      title: 'Como enche',
      blocks: [
        {
          table: {
            head: ['Jogada', 'Flow'],
            rows: [
              ['Drible vencido', `+${R.flow.dribbleWon}`],
              ['Leitura certa (perto do lance)', `+${R.flow.readCorrect}`],
              ['Seu passe vira finalização (no lance ou no seguinte)', `+${R.flow.passToShot}`],
              ['Gol', `+${R.flow.goal}`],
              ['Defesa do goleiro', `+${R.flow.goalkeeperSave}`],
            ],
          },
        },
        'A barra não esvazia sozinha: o que você ganhou fica até você usar.',
      ],
    },
    {
      title: 'Como usar',
      blocks: [
        `Com a barra em ${R.flow.max}, marque Flow no planejamento. A habilidade de Flow do seu loadout ativa no começo da resolução e a barra volta a 0.`,
        'Você só leva uma habilidade de Flow por partida: a do loadout ([[loadout]]). Ela precisa servir para a situação, como qualquer habilidade.',
        { h: 'As habilidades de Flow' },
        { table: { head: ['Habilidade', 'Linhagem', 'Efeito'], rows: flows.map((s) => [s.name, lineageName(s.lineageId), s.describe(s.params, { stamina: s.stamina, cooldown: s.cooldown })]) } },
        { note: 'Todo Flow aparece na revelação como "usou Flow". O efeito exato, não.' },
      ],
    },
  ],
  examples: [
    {
      title: 'Enchendo a barra',
      figure: <FlowGauge gains={gains} max={R.flow.max} />,
      text: `Um drible (+${R.flow.dribbleWon}), uma Leitura certa (+${R.flow.readCorrect}), um gol (+${R.flow.goal}) e mais uma defesa ou jogada decisiva. Em uma partida movimentada, dá para usar o Flow pelo menos uma vez.`,
    },
  ],
  faq: [
    { q: 'O Flow passa para a próxima partida?', a: 'Não. Toda partida começa com a barra vazia.' },
    { q: 'Posso usar Flow e uma habilidade ativa no mesmo lance?', a: 'Pode. São escolhas separadas no planejamento.' },
    { q: 'Flow custa fôlego?', a: 'Não.' },
  ],
  related: ['folego', 'linhagens', 'loadout'],
};

// ---------------------------------------------------------------------------
export const egoEQuimica: GuideDoc = {
  slug: 'ego-e-quimica',
  summary: 'Ego mede o quanto você decide sozinho. Química mede o quanto você joga com o time. Os dois são contados em toda partida.',
  sections: [
    {
      title: 'Ego',
      blocks: [{ list: ['+1 por drible vencido.', '+1 por gol.'] }],
    },
    {
      title: 'Química',
      blocks: [
        {
          list: [
            `+${R.offBall.pedirBolaChemistry} para quem passa e quem recebe quando um Pedir a bola é atendido.`,
            '+1 para cada um numa tabela completa.',
            '+1 para quem dá a assistência.',
          ],
        },
      ],
    },
    {
      title: 'Para que servem hoje',
      blocks: ['Nesta versão, Ego e Química são medições: aparecem no registro da partida e não somam em rolagens. A instalação observa. Jogue do seu jeito.'],
    },
  ],
  examples: [
    {
      title: 'Química numa jogada combinada',
      figure: (
        <FieldDiagram
          title="Pedir a bola atendido"
          tokens={[
            { x: 4, y: 3, team: 'A', n: 10, ball: true },
            { x: 7, y: 2, team: 'A', n: 9, tag: 'PEDIU' },
          ]}
          arrows={[{ from: [4, 3], to: [7, 2], kind: 'pass', label: `+${R.offBall.pedirBolaChemistry} química` }]}
        />
      ),
      text: `O 9 pediu a bola e o 10 atendeu: +${R.offBall.pedirBolaPassBonus} no passe e +${R.offBall.pedirBolaChemistry} de Química para os dois.`,
    },
  ],
  faq: [{ q: 'Ego alto deixa o jogador mais forte?', a: 'Não nesta versão. É uma medida de estilo.' }],
  related: ['acoes-sem-bola-ataque', 'passe'],
};

// ---------------------------------------------------------------------------
function kickoffTokens(mode: MatchMode): FieldToken[] {
  const n = PLAYERS_PER_SIDE[mode];
  const slots = (['A', 'B'] as const).flatMap((team) => [
    ...Array.from({ length: n }, (_, i) => ({ id: `${team}${i + 1}`, team, isKeeper: false })),
    { id: `${team}GK`, team, isKeeper: true },
  ]);
  const setup = { field: FIELD_SIZES[mode], slots } as unknown as MatchSetup;
  const pos = kickoffPositions(setup, 'A');
  return slots.map((s) => ({ x: pos[s.id].x, y: pos[s.id].y, team: s.team, keeper: s.isKeeper, ball: s.id === 'A1', n: s.isKeeper ? 1 : Number(s.id.slice(1)) + 1 }));
}

export const modosECampos: GuideDoc = {
  slug: 'modos-e-campos',
  summary: `Cinco formatos, de ${MATCH_MODES[0]} a ${MATCH_MODES[MATCH_MODES.length - 1]}. O campo cresce com o número de jogadores. Todo time tem goleiro, humano ou bot.`,
  sections: [
    {
      title: 'Formatos',
      blocks: [
        {
          table: {
            head: ['Modo', 'Jogadores de linha por lado', 'Campo (casas)', 'Ranking', 'Orçamento de raridade'],
            rows: MATCH_MODES.map((m) => [m, PLAYERS_PER_SIDE[m], `${FIELD_SIZES[m].width} x ${FIELD_SIZES[m].height}`, rankGroupForMode(m) === 'solo' ? 'Solo' : 'Time', DEFAULT_RARITY_BUDGET[m]]),
          },
        },
        `O gol tem ${R.goalWidth} casas de largura, no meio da linha de fundo. A área do goleiro tem ${R.areaDepth} colunas de fundo e cobre as linhas do gol mais ${R.areaExtraRows} para cada lado.`,
        'O time A ataca para a direita. Na saída, o primeiro jogador de linha do time com a bola fica no centro.',
      ],
    },
  ],
  examples: [
    {
      title: 'Os campos em escala, com a formação de saída',
      figure: (
        <div className="g-scale">
          {MATCH_MODES.map((m) => (
            <div key={m} style={{ width: `${(FIELD_SIZES[m].width / Math.max(...MATCH_MODES.map((x) => FIELD_SIZES[x].width))) * 100}%` }}>
              <FieldDiagram step={`${m} · ${FIELD_SIZES[m].width}x${FIELD_SIZES[m].height}`} title={`Campo do ${m}`} size={FIELD_SIZES[m]} tokens={kickoffTokens(m)} />
            </div>
          ))}
        </div>
      ),
      text: `As posições são as mesmas que o motor usa na saída de bola. O gol ocupa as linhas ${goalRows(FIELD_SIZES['3v3']).map((y) => y + 1).join(', ')} no campo do 3v3.`,
    },
  ],
  faq: [
    { q: 'Posso jogar de goleiro?', a: 'Pode. Quando não há humano no gol, um bot assume.' },
    { q: '1v1 e 2v2 contam para qual ranking?', a: 'Para o Solo. 3v3, 4v4 e 5v5 contam para o Time.' },
  ],
  related: ['orcamento-de-raridade', 'estrutura-do-lance', 'ranking-e-temporadas'],
};

// ---------------------------------------------------------------------------
const byRarity = (r: string) => LINEAGES.find((l) => l.rarity === r);
function combo(names: LineageDef[], mode: MatchMode) {
  const total = names.reduce((a, l) => a + RARITY_COST[l.rarity], 0);
  const fits = total <= DEFAULT_RARITY_BUDGET[mode];
  return { label: names.map((l) => `${l.name} (${RARITY_COST[l.rarity]})`).join(' + '), total, fits };
}
const top = [...LINEAGES].sort((a, b) => RARITY_COST[b.rarity] - RARITY_COST[a.rarity]);
const low = [...LINEAGES].sort((a, b) => RARITY_COST[a.rarity] - RARITY_COST[b.rarity]);
const exA = combo([top[0], top[1]], '2v2');
const exB = combo([top[0], low[0]], '2v2');
const exC = combo([top[0], top[1], low[0]], '3v3');

export const orcamento: GuideDoc = {
  slug: 'orcamento-de-raridade',
  summary: 'Na ranqueada, cada linhagem custa pontos pela raridade. A soma do time não pode passar do teto do modo. Ninguém monta um time só de míticas.',
  sections: [
    {
      title: 'Custo por raridade',
      blocks: [
        { table: { head: ['Raridade', 'Custo', 'Linhagens'], rows: RARITIES.map((r) => [RARITY_LABEL[r], RARITY_COST[r], LINEAGES.filter((l) => l.rarity === r).map((l) => l.name).join(', ') || '—']) } },
      ],
    },
    {
      title: 'Teto por modo',
      blocks: [
        { table: { head: ['Modo', 'Teto do time'], rows: MATCH_MODES.map((m) => [m, DEFAULT_RARITY_BUDGET[m]]) } },
        'A administração do servidor pode mudar esses tetos. O Modo Seleção usa um teto próprio para montar os adversários de cada etapa.',
      ],
    },
  ],
  examples: [
    {
      title: 'Montando um 2v2 e um 3v3',
      figure: (
        <div className="budget">
          {[
            { mode: '2v2' as MatchMode, c: exA },
            { mode: '2v2' as MatchMode, c: exB },
            { mode: '3v3' as MatchMode, c: exC },
          ].map(({ mode, c }, i) => (
            <div key={i} className={`budget__row${c.fits ? '' : ' is-over'}`}>
              <span className="label">{mode} · teto {DEFAULT_RARITY_BUDGET[mode]}</span>
              <span className="budget__combo">{c.label}</span>
              <span className="num budget__total" style={{ color: c.fits ? COLORS.success : COLORS.alert }}>
                {c.total}
              </span>
              <span className="t-mono">{c.fits ? 'Cabe' : 'Passa do teto'}</span>
            </div>
          ))}
        </div>
      ),
      text: `${exA.label} = ${exA.total}: ${exA.fits ? 'cabe' : 'não cabe'} no 2v2. ${exB.label} = ${exB.total}: ${exB.fits ? 'cabe' : 'não cabe'}. No 3v3, ${exC.label} = ${exC.total}: ${exC.fits ? 'cabe' : 'não cabe'}.`,
    },
  ],
  faq: [
    { q: 'Vale na casual?', a: 'O teto é da ranqueada.' },
    { q: 'Tenho uma linhagem cara. Fico de fora?', a: `Não. Você só precisa de companheiros mais baratos. ${byRarity('comum')?.name ?? 'A linhagem comum'} custa ${RARITY_COST.comum}.` },
  ],
  related: ['modos-e-campos', 'linhagens', 'ranking-e-temporadas'],
};

