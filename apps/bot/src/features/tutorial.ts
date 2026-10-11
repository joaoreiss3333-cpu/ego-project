import { randomBytes } from 'node:crypto';
import { ACTION_LABEL, GAME, MATCH_RULES, type ActionKind, type MatchMode } from '@ego/content';
import {
  botSlot,
  buildSetup,
  createMatch,
  keeperSlot,
  normalizePlans,
  planBots,
  reachableCells,
  resolveTurn,
  stayPlan,
  type Cell,
  type MatchState,
  type Plan,
  type PlanMap,
  type SlotSetup,
  type Team,
  type TurnResult,
} from '@ego/engine';
import { renderField, renderPlanView, renderStepsGif } from '@ego/render';
import { explainBlocks } from '../match/explain';
import { applyClick, draftToPlan, newDraft, panelScreen, type Draft } from '../match/panel';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, file, images, row, screen, select, selectBlock, sep, text, type Block, type ScreenSpec } from '../ui';
import { replyError } from '../util/reply';
import { assertOwner } from './common';

/**
 * /tutorial: explicações curtas e treinos práticos com o mesmo painel das
 * partidas. Tudo em memória e efêmero: não gasta energia, não grava nada.
 */

// ---------------------------------------------------------------------------
// Cenários dos treinos
// ---------------------------------------------------------------------------

interface Placement {
  id: string;
  team: Team;
  name: string;
  pos: Cell;
  keeper?: boolean;
}

interface Scenario {
  state: MatchState;
  you: string;
}

/** Monta um estado de partida com todo mundo nas casas pedidas. */
function scenario(mode: MatchMode, youName: string, placements: Placement[], holder: string): Scenario {
  const slots: SlotSetup[] = placements.map((p) =>
    p.keeper
      ? { ...keeperSlot(p.id, p.team, 5, 'novato'), name: p.name }
      : { ...botSlot({ name: p.id === 'A1' ? youName : p.name, lineageId: 'isagi', level: 5, personality: 'coletivo', position: 'atacante' }, p.id, p.team, 'novato'), loadout: { active: [], flow: null } },
  );
  const setup = buildSetup({ id: `tut-${randomBytes(4).toString('hex')}`, seed: randomBytes(8).toString('hex'), mode, kind: 'treino', slots, turnsPerHalf: MATCH_RULES.turnsPerHalf, halves: 1, firstTo: null });
  const state = createMatch(setup);
  for (const p of placements) state.players[p.id].pos = { ...p.pos };
  state.ball = { holder, pos: { ...state.players[holder].pos } };
  return { state, you: 'A1' };
}

const keepers = (f: { width: number; height: number }): Placement[] => [
  { id: 'AGK', team: 'A', name: 'Goleiro A', pos: { x: 0, y: Math.floor(f.height / 2) }, keeper: true },
  { id: 'BGK', team: 'B', name: 'Goleiro B', pos: { x: f.width - 1, y: Math.floor(f.height / 2) }, keeper: true },
];
const F11 = { width: 11, height: 7 };

const move = (id: string, dest: Cell, action: ActionKind = 'mover', extra: Partial<Plan> = {}): Plan => ({ playerId: id, dest, action, ...extra });
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

interface Lesson {
  title: string;
  goal: string;
  tip: string;
  mark?: Cell;
  build(youName: string): Scenario;
  /** Planos dos outros jogadores (roteiro do treino). */
  script(s: MatchState): PlanMap;
  /** Avalia a escolha e o que aconteceu. */
  check(plan: Plan, r: TurnResult, s: MatchState): { ok: boolean; msg: string };
}

const LESSONS: Lesson[] = [
  {
    title: 'Conduzir até um ponto',
    goal: 'Leve a bola até a casa marcada com **AQUI**.',
    tip: 'Escolha **Conduzir** no menu. Depois use as setas para colocar o destino em cima da casa amarela e confirme.',
    mark: { x: 5, y: 2 },
    build: (n) =>
      scenario('1v1', n, [{ id: 'A1', team: 'A', name: n, pos: { x: 3, y: 3 } }, { id: 'B1', team: 'B', name: 'Rival', pos: { x: 9, y: 1 } }, ...keepers(F11)], 'A1'),
    script: (s) => ({ B1: stayPlan(s, 'B1'), AGK: stayPlan(s, 'AGK'), BGK: stayPlan(s, 'BGK') }),
    check(plan, r) {
      const at = r.state.players.A1.pos;
      if (plan.action !== 'conduzir' && plan.action !== 'driblar') return { ok: false, msg: `Você escolheu **${ACTION_LABEL[plan.action]}**. Para andar com a bola, a ação é **Conduzir**.` };
      if (!same(at, this.mark!)) return { ok: false, msg: 'Quase! Você andou, mas não parou na casa marcada. Mova o destino com as setas até ficar em cima do **AQUI**.' };
      if (r.state.ball.holder !== 'A1') return { ok: false, msg: 'Você chegou, mas perdeu a bola no caminho. Tente de novo.' };
      return { ok: true, msg: 'Isso! **Conduzir** anda com a bola e para antes de entrar na zona de um adversário, então é o jeito seguro de avançar.' };
    },
  },
  {
    title: 'Chutar',
    goal: 'Você está perto do gol. **Chute** e escolha um canto.',
    tip: 'Escolha **Chutar**. No destino, pode ficar no lugar ou chegar mais perto. Depois escolha o canto do gol e confirme.',
    build: (n) =>
      scenario('1v1', n, [{ id: 'A1', team: 'A', name: n, pos: { x: 7, y: 3 } }, { id: 'B1', team: 'B', name: 'Rival', pos: { x: 4, y: 5 } }, ...keepers(F11)], 'A1'),
    script: (s) => ({ B1: stayPlan(s, 'B1'), AGK: stayPlan(s, 'AGK'), ...planBots(s, ['BGK']).plans }),
    check(plan, r) {
      if (plan.action !== 'chutar') return { ok: false, msg: `Você escolheu **${ACTION_LABEL[plan.action]}**. Neste treino a ideia é **Chutar**.` };
      const shot = r.events.find((e) => e.t === 'shot');
      if (shot?.t === 'shot' && shot.goal) return { ok: true, msg: 'GOL! Chute é seu atributo Chute + dado de 10 lados contra o goleiro. De perto e de frente para o gol fica mais fácil.' };
      return {
        ok: true,
        msg: `Chute feito, mas o goleiro defendeu. Ele também escolhe um canto: quando acerta o seu, fica bem mais difícil. Até ${MATCH_RULES.shot.freeDistance} casas do gol não há penalidade de distância. Varie os cantos!`,
      };
    },
  },
  {
    title: 'Passar',
    goal: 'Seu companheiro **Parceiro** está livre lá na frente. Passe para ele.',
    tip: 'Escolha **Passe no pé**, deixe o destino no lugar e, na etapa Alvo, escolha **Parceiro**.',
    build: (n) =>
      scenario(
        '2v2',
        n,
        [
          { id: 'A1', team: 'A', name: n, pos: { x: 4, y: 3 } },
          { id: 'A2', team: 'A', name: 'Parceiro', pos: { x: 7, y: 1 } },
          { id: 'B1', team: 'B', name: 'Rival 1', pos: { x: 6, y: 5 } },
          { id: 'B2', team: 'B', name: 'Rival 2', pos: { x: 9, y: 5 } },
          ...keepers(F11),
        ],
        'A1',
      ),
    script: (s) => ({ A2: move('A2', s.players.A2.pos, 'pedir_bola'), B1: stayPlan(s, 'B1'), B2: stayPlan(s, 'B2'), AGK: stayPlan(s, 'AGK'), BGK: stayPlan(s, 'BGK') }),
    check(plan, r) {
      if (plan.action !== 'passe_pe' && plan.action !== 'passe_espaco') return { ok: false, msg: `Você escolheu **${ACTION_LABEL[plan.action]}**. Neste treino, use **Passe no pé** e escolha o Parceiro.` };
      const pass = r.events.find((e) => e.t === 'pass');
      if (pass?.t === 'pass' && pass.result === 'ok') return { ok: true, msg: 'Passe certo! Passe no pé chega onde o companheiro terminar o movimento. Ele pediu a bola, por isso o passe teve +1.' };
      return { ok: true, msg: `O passe não chegou desta vez. Passe é seu atributo Passe + dado: abaixo de ${MATCH_RULES.pass.astrayThreshold} ele sai torto, e passes longos perdem pontos. Mesmo assim, a escolha foi a certa.` };
    },
  },
  {
    title: 'Driblar contra o Bote',
    goal: 'O defensor colado em você **vai dar Bote** (vai tentar tomar a bola). Passe por ele.',
    tip: '**Driblar vence Bote**: você ganha +2 no duelo. Escolha **Driblar** e mande o destino para a frente na diagonal (↗ ou ↘), passando ao lado dele.',
    build: (n) => scenario('1v1', n, [{ id: 'A1', team: 'A', name: n, pos: { x: 4, y: 3 } }, { id: 'B1', team: 'B', name: 'Rival', pos: { x: 5, y: 3 } }, ...keepers(F11)], 'A1'),
    script: (s) => ({ B1: move('B1', s.players.B1.pos, 'bote'), AGK: stayPlan(s, 'AGK'), BGK: stayPlan(s, 'BGK') }),
    check(plan, r) {
      if (plan.action === 'conduzir') return { ok: false, msg: 'Conduzindo, você não ganha bônus contra o Bote. Contra quem se joga na bola, **Driblar** dá +2.' };
      if (plan.action === 'proteger') return { ok: false, msg: 'Proteger segura a bola, mas contra Bote fica empatado e você não avança. Aqui, **Driblar** dá +2.' };
      if (plan.action !== 'driblar') return { ok: false, msg: `Você escolheu **${ACTION_LABEL[plan.action]}**. Neste treino, use **Driblar**.` };
      const kept = r.state.ball.holder === 'A1';
      return kept
        ? { ok: true, msg: 'Passou! O Bote perde para o Drible, e o defensor que erra o Bote fica **vendido**: não se mexe no próximo lance.' }
        : { ok: true, msg: 'Ele ganhou o duelo desta vez. Você tinha +2, mas o dado ainda decide, e empate é da defesa. A escolha foi a certa.' };
    },
  },
  {
    title: 'Defender com Conter',
    goal: 'Agora você defende. O atacante **vai driblar** para cima de você. Pare ele.',
    tip: '**Conter vence Driblar**: você ganha +2. Escolha **Conter** e fique no lugar, na frente dele.',
    build: (n) =>
      scenario('1v1', n, [{ id: 'A1', team: 'A', name: n, pos: { x: 5, y: 3 } }, { id: 'B1', team: 'B', name: 'Atacante', pos: { x: 6, y: 3 } }, ...keepers(F11)], 'B1'),
    script: (s) => ({ B1: move('B1', { x: 4, y: 3 }, 'driblar'), AGK: stayPlan(s, 'AGK'), BGK: stayPlan(s, 'BGK') }),
    check(plan, r) {
      if (plan.action === 'bote') return { ok: false, msg: 'Bote contra quem vai driblar é o pior caso: o drible ganha +2. Contra drible, **Conter**.' };
      if (plan.action !== 'conter') return { ok: false, msg: `Você escolheu **${ACTION_LABEL[plan.action]}**. Neste treino, use **Conter**.` };
      const stole = r.state.ball.holder === 'A1';
      return stole
        ? { ok: true, msg: 'Roubou! Conter espera o drible e pune. Bote força o duelo, mas é justamente o que o drible vence.' }
        : { ok: true, msg: 'Ele passou desta vez. Você tinha +2, mas o dado ainda decide. A escolha foi a certa.' };
    },
  },
];

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

interface InfoPage {
  kind: 'info';
  title: string;
  body: string;
  image?: () => Buffer;
}

type Page = InfoPage | { kind: 'lesson'; index: number };

/** Estado de exemplo das explicações (2v2, você com a bola). */
let sample: Scenario | null = null;
function sampleState(): Scenario {
  if (!sample)
    sample = scenario(
      '2v2',
      'Você',
      [
        { id: 'A1', team: 'A', name: 'Você', pos: { x: 4, y: 3 } },
        { id: 'A2', team: 'A', name: 'Parceiro', pos: { x: 6, y: 1 } },
        { id: 'B1', team: 'B', name: 'Rival 1', pos: { x: 6, y: 4 } },
        { id: 'B2', team: 'B', name: 'Rival 2', pos: { x: 8, y: 2 } },
        ...keepers(F11),
      ],
      'A1',
    );
  return sample;
}

const imageCache = new Map<string, Buffer>();
function cached(key: string, make: () => Buffer): Buffer {
  let b = imageCache.get(key);
  if (!b) {
    b = make();
    imageCache.set(key, b);
  }
  return b;
}

const PAGES: Page[] = [
  {
    kind: 'info',
    title: 'Bem-vindo',
    body: [
      `${GAME.name} é futebol tático **por lances**, como um jogo de tabuleiro. Cada lance tem três momentos:`,
      '**1. Todos planejam ao mesmo tempo, em segredo.** Você escolhe o que fazer e para onde ir.',
      '**2. As setas aparecem.** Todo mundo vê para onde cada um vai, mas não a ação (passe, drible, chute...).',
      '**3. O lance acontece.** O bot mostra um GIF com o movimento, os duelos e o resultado.',
      `Ganha quem fizer mais gols. Uma partida normal tem ${MATCH_RULES.halves} tempos de ${MATCH_RULES.turnsPerHalf} lances.`,
      '-# Este tutorial tem 5 explicações rápidas e 5 treinos práticos. Nada aqui gasta energia nem conta no seu histórico.',
    ].join('\n'),
    image: () => {
      const s = sampleState().state;
      return cached('welcome', () =>
        renderField(s, {
          showZones: true,
          legend: 'match',
          hudRight: 'EXEMPLO',
          tag: { id: 'A1', text: 'VOCÊ' },
          arrows: [
            { from: s.players.A1.pos, to: { x: 5, y: 2 }, kind: 'ataque' },
            { from: s.players.A2.pos, to: { x: 8, y: 1 }, kind: 'apoio' },
            { from: s.players.B1.pos, to: { x: 5, y: 3 }, kind: 'defesa' },
          ],
        }),
      );
    },
  },
  {
    kind: 'info',
    title: 'O campo',
    body: [
      '- O campo é uma **grade**. Cada jogador ocupa uma casa.',
      '- A **cor** mostra o time (A azul, B branco) e o número é a camisa. O **ponto branco** no canto do token é a bola.',
      '- O gol são as casas brancas na linha de fundo. O **goleiro** (token quadrado) só anda dentro da área.',
      '- **Zona de controle:** as 8 casas em volta de cada jogador de linha (sombreadas). Levar a bola para dentro da zona de um adversário pode virar **duelo**.',
      `- **Movimento:** ${MATCH_RULES.movement.base} casas por lance, mais 1 a cada ${MATCH_RULES.movement.velocityDivisor} pontos de Velocidade. Diagonal conta como 1 casa.`,
      '-# Na imagem: a área acesa é até onde "Você" alcança neste lance. O resto fica escuro.',
    ].join('\n'),
    image: () => {
      const s = sampleState().state;
      return cached('field', () => renderPlanView(s, 'A1', { reach: reachableCells(s, 'A1') }));
    },
  },
  {
    kind: 'info',
    title: 'Seu painel',
    body: [
      'Na partida, clique em **Planejar meu lance**. Abre um painel que **só você vê**, em etapas:',
      '**1. Ação:** um menu com cada opção explicada embaixo do nome.',
      '**2. Destino:** as setas **↑ ↓ ← →** (e diagonais) movem o destino no campo. Os **Atalhos** já escolhem destinos úteis, como "Rumo ao gol" ou "Pressionar".',
      '**3. Alvo:** só quando a ação pede. Para quem passar, em que canto chutar...',
      'Depois, **Confirmar plano**. Dá para refazer até o tempo acabar. Se você não confirmar a tempo, a IA joga aquele lance por você.',
      `-# Extras, na etapa Destino: **Sprint** dá +${MATCH_RULES.movement.sprintBonus} casas por ${MATCH_RULES.stamina.sprintCost} de fôlego. Suas habilidades aparecem ali com o custo.`,
    ].join('\n'),
    image: () => {
      const s = sampleState().state;
      return cached('panel', () => renderPlanView(s, 'A1', { dest: { x: 5, y: 2 }, pass: s.players.A2.pos }));
    },
  },
  {
    kind: 'info',
    title: 'Duelos em 30 segundos',
    body: [
      'Duelo é **atributo + dado de 10 lados + bônus**. Quem tirar mais vence. **Empate é da defesa.**',
      'Acontece quando o portador está na zona de um defensor e: o portador escolheu **Driblar**, ou o defensor escolheu **Bote** ou **Conter**.',
      '',
      `**Quem ganha +${MATCH_RULES.duel.matrixBonus}:**`,
      '- **Driblar** vence **Bote** (o defensor se joga e fica para trás)',
      '- **Conter** vence **Driblar** (o defensor espera e fecha)',
      '- **Passar** vence **Bote** (a bola sai antes)',
      '- **Proteger** empata com Bote e vence Conter',
      '',
      '**Conduzir** para na borda da zona: é o jeito seguro de avançar. **Driblar** atravessa zonas, mas cada uma vira um duelo.',
      '-# Defensor que perde depois de dar Bote fica **vendido**: não se mexe no próximo lance.',
    ].join('\n'),
  },
  {
    kind: 'info',
    title: 'Fôlego, Flow e Leitura',
    body: [
      `**Fôlego** (0 a ${MATCH_RULES.stamina.max}): Sprint, Bote e habilidades gastam. Volta ${MATCH_RULES.stamina.regenPerTurn} por lance. Abaixo de ${MATCH_RULES.stamina.lowThreshold}, você perde ${MATCH_RULES.stamina.lowPenalty} em todas as rolagens.`,
      `**Flow** (0 a ${MATCH_RULES.flow.max}): enche quando você joga bem (drible vencido, leitura certa, gol). Cheio, libera a habilidade de Flow do seu loadout por um lance.`,
      `**Leitura** (defesa): você aposta no que o portador vai fazer. Acertou e estava perto: +${MATCH_RULES.duel.readBonus} no lance e Flow. Errou: -${MATCH_RULES.duel.readWrongInitiativePenalty} de iniciativa no lance seguinte.`,
      '',
      'Agora vamos praticar. São 5 treinos curtos, com o painel de verdade.',
    ].join('\n'),
  },
  ...LESSONS.map((_, index) => ({ kind: 'lesson' as const, index })),
  {
    kind: 'info',
    title: 'Pronto para jogar',
    body: [
      'Você já sabe o essencial. Próximos passos:',
      '- **/treino 1v1**: uma partida curta contra um bot, com recompensa.',
      '- **/selecao**: Modo Seleção, etapas contra times da instalação.',
      '- **/partida criar** ou **/fila ranqueada**: jogar contra outras pessoas.',
      '- **/guia**: todas as regras com exemplos, no site.',
      '-# Durante a partida, o botão **Como jogar** mostra um resumo rápido.',
    ].join('\n'),
  },
];

const pageTitle = (p: Page) => (p.kind === 'info' ? p.title : `Treino ${p.index + 1}: ${LESSONS[p.index].title}`);

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

interface TutorialSession {
  owner: string;
  youName: string;
  page: number;
  lesson: { index: number; scenario: Scenario; draft: Draft; result: { ok: boolean; msg: string; gif: Buffer; log: string[]; explain: Block[] } | null } | null;
  at: number;
}

const tutorials = new Map<string, TutorialSession>();

setInterval(() => {
  // tutoriais abandonados expiram em 30 min
  for (const [k, s] of tutorials) if (Date.now() - s.at > 30 * 60_000) tutorials.delete(k);
}, 60_000).unref();

function startLesson(t: TutorialSession, index: number) {
  const sc = LESSONS[index].build(t.youName);
  t.lesson = { index, scenario: sc, draft: newDraft(sc.state, sc.you), result: null };
}

function goTo(t: TutorialSession, page: number) {
  t.page = Math.max(0, Math.min(PAGES.length - 1, page));
  const p = PAGES[t.page];
  if (p.kind === 'lesson') startLesson(t, p.index);
  else t.lesson = null;
}

function navRow(t: TutorialSession): Block {
  const prev = t.page > 0 ? btn(cid('tu', t.owner, 'page', t.page - 1), '‹ Anterior') : null;
  const next = t.page < PAGES.length - 1 ? btn(cid('tu', t.owner, 'page', t.page + 1), PAGES[t.page + 1].kind === 'lesson' && PAGES[t.page].kind === 'info' ? 'Começar treinos ›' : 'Próximo ›', ButtonStyle.Primary) : null;
  return row(...([prev, next].filter(Boolean) as ReturnType<typeof btn>[]), btn(cid('tu', t.owner, 'end'), 'Sair'));
}

function jumpMenu(t: TutorialSession): Block {
  return selectBlock(
    select(
      cid('tu', t.owner, 'jump'),
      'Ir para...',
      PAGES.map((p, i) => ({ label: `${i + 1}. ${pageTitle(p)}`, value: String(i), default: i === t.page })),
    ),
  );
}

export function tutorialScreen(t: TutorialSession): ScreenSpec {
  t.at = Date.now();
  const page = PAGES[t.page];
  const counter = `-# Tutorial · ${t.page + 1} de ${PAGES.length}`;
  if (page.kind === 'info') {
    const blocks: Block[] = [text(`### ${page.title}\n${counter}`)];
    const files = [];
    if (page.image) {
      files.push(file(page.image(), 'tutorial.png'));
      blocks.push(images('tutorial.png'));
    }
    blocks.push(text(page.body), sep(), navRow(t), jumpMenu(t));
    return { accent: 'padrao', blocks, files };
  }
  const L = LESSONS[page.index];
  const lesson = t.lesson!;
  if (lesson.result) {
    const r = lesson.result;
    return {
      accent: r.ok ? 'sucesso' : 'aviso',
      files: [file(r.gif, 'lance.gif')],
      blocks: [
        text(`### Treino ${page.index + 1} de ${LESSONS.length} · ${r.ok ? 'Muito bem!' : 'Quase lá'}\n${r.msg}`),
        images('lance.gif'),
        ...r.explain,
        text('-# O GIF mostra o lance inteiro, com uma legenda embaixo em cada momento. Numa partida, essa explicação aparece na mensagem do lance.'),
        row(btn(cid('tu', t.owner, 'retry'), 'Tentar de novo'), ...(t.page < PAGES.length - 1 ? [btn(cid('tu', t.owner, 'page', t.page + 1), 'Próximo ›', ButtonStyle.Primary)] : [])),
      ],
    };
  }
  const intro: Block[] = [text(`## Treino ${page.index + 1} de ${LESSONS.length} · ${L.title}\n**Objetivo:** ${L.goal}\n-# Dica: ${L.tip}`)];
  const spec = panelScreen({
    matchId: t.owner,
    state: lesson.scenario.state,
    slotId: lesson.scenario.you,
    draft: lesson.draft,
    mode: 'plan',
    deadline: 0,
    prefix: 'tp',
    intro,
    mark: L.mark ?? null,
    confirmLabel: 'Jogar o lance',
  });
  spec.accent = 'padrao';
  spec.blocks.push(row(btn(cid('tu', t.owner, 'page', t.page - 1), '‹ Anterior'), btn(cid('tu', t.owner, 'page', t.page + 1), 'Pular treino ›'), btn(cid('tu', t.owner, 'end'), 'Sair')));
  return spec;
}

/** Resolve o lance do treino com o plano do jogador e o roteiro dos outros. */
function playLesson(t: TutorialSession) {
  const lesson = t.lesson!;
  const L = LESSONS[lesson.index];
  const { state, you } = lesson.scenario;
  const plan = draftToPlan(you, lesson.draft);
  const plans = normalizePlans(state, { ...L.script(state), [you]: plan });
  const r = resolveTurn(state, plans);
  const verdict = L.check(plans[you], r, state);
  lesson.result = { ...verdict, gif: renderStepsGif(state, r), log: r.log, explain: explainBlocks(state, r, 2200) };
}

function newTutorial(owner: string, youName: string): TutorialSession {
  const t: TutorialSession = { owner, youName: youName.slice(0, 14) || 'Você', page: 0, lesson: null, at: Date.now() };
  tutorials.set(owner, t);
  return t;
}

// ---------------------------------------------------------------------------
// Ajuda rápida (botão "Como jogar" da partida)
// ---------------------------------------------------------------------------

export function quickHelpScreen(userId: string): ScreenSpec {
  return {
    accent: 'padrao',
    blocks: [
      text(
        [
          '### Como jogar um lance',
          '**1.** Clique em **Planejar meu lance**. O painel é só seu.',
          '**2. Ação:** escolha no menu. Cada opção tem a explicação embaixo do nome.',
          '**3. Destino:** as setas movem o destino no campo. A área acesa é até onde você alcança. Os **Atalhos** escolhem destinos prontos.',
          '**4. Alvo** (se a ação pedir): para quem passar, em que canto chutar...',
          '**5. Confirmar plano.** Quando todos confirmarem (ou o tempo acabar), as setas aparecem e o lance acontece no GIF.',
        ].join('\n'),
      ),
      sep(),
      text(
        [
          '**Setas no campo:** branca = quem tem a bola · azul = companheiros dele · amarela tracejada = defesa · azul com brilho = habilidade.',
          `**Duelos:** Driblar vence Bote · Conter vence Driblar · Passar vence Bote. Empate é da defesa.`,
          '**Conduzir** para antes da zona do adversário (seguro). **Driblar** atravessa, mas cada zona vira duelo.',
          '-# Quer praticar sem pressa? O tutorial tem treinos com o painel de verdade.',
        ].join('\n'),
      ),
      row(btn(cid('tu', userId, 'start'), 'Abrir tutorial', ButtonStyle.Primary)),
    ],
  };
}

// ---------------------------------------------------------------------------
// Comando e cliques
// ---------------------------------------------------------------------------

on.command('tutorial', async (i) => {
  const t = newTutorial(i.user.id, i.user.displayName);
  await i.reply(screen(tutorialScreen(t), { ephemeral: true }));
});

// navegação: tu:<dono>:<ação>:<arg>
on.component('tu', async (i, [owner, action, arg]) => {
  assertOwner(i, owner);
  let t = tutorials.get(owner);
  if (action === 'start' || !t) {
    if (action !== 'start' && !t) return replyError(i, 'Esse tutorial expirou. Use /tutorial de novo.');
    t = newTutorial(owner, i.user.displayName);
    // 'novo': abre em outra mensagem, sem apagar a tela de onde veio o clique
    if (arg === 'novo') return i.reply(screen(tutorialScreen(t), { ephemeral: true }));
  }
  if (action === 'end') {
    tutorials.delete(owner);
    return i.update(edit({ accent: 'sucesso', blocks: [text('### Tutorial fechado\nVolte quando quiser com **/tutorial**. Boa avaliação!')] }));
  }
  if (action === 'page') goTo(t, Number(arg));
  if (action === 'jump' && i.isStringSelectMenu()) goTo(t, Number(i.values[0]));
  if (action === 'retry' && t.lesson) startLesson(t, t.lesson.index);
  return i.update(edit(tutorialScreen(t)));
});

// painel do treino: tp:<ação>:<dono>:<arg> (mesmo formato do painel da partida)
on.component('tp', async (i, [action, owner, arg]) => {
  assertOwner(i, owner);
  const t = tutorials.get(owner);
  if (!t?.lesson || t.lesson.result) return replyError(i, 'Esse treino já terminou. Use /tutorial de novo.');
  const { state, you } = t.lesson.scenario;
  const values = i.isStringSelectMenu() ? i.values : null;
  const res = applyClick(state, you, t.lesson.draft, action, arg, values, { mode: 'plan' });
  if (res === 'confirm') playLesson(t);
  return i.update(edit(tutorialScreen(t)));
});

/** Para testes. */
export const __tutorial = { PAGES, LESSONS, newTutorial, tutorialScreen, tutorials, playLesson, goTo };
