import { ACTION_LABEL, GOAL_ZONE_LABEL, MATCH_RULES as R, PROGRESSION, READ_GUESS_LABEL, getSkill, type GoalZone } from '@ego/content';
import { duelMatrix, zonesAdjacent } from '@ego/engine';
import { FieldDiagram } from '@/components/field/FieldDiagram';
import { GoalZones } from '@/components/field/DuelMatrix';
import { FigRow } from '../figures';
import { passPenalty, shotDistPenalty } from '../data';
import type { GuideDoc } from '../types';

const sk = (id: string) => getSkill(id);
const passValues = Array.from({ length: PROGRESSION.attrMax - PROGRESSION.attrStart + 1 }, (_, i) => PROGRESSION.attrStart + i);
const passDists = [4, 6, 8, 10];

// ---------------------------------------------------------------------------
const exPassDist = 4;
const exPassPen = passPenalty(7, exPassDist);
const exPassRoll = 7 + 6 - exPassPen;
const curva = sk('passe_curva');
const faixa = sk('faixa_aceleracao');

export const passe: GuideDoc = {
  slug: 'passe',
  summary: `Passe acontece depois do movimento, da casa onde o portador parou. A rolagem é Passe + d10, com penalidade por distância. Quem tiver a zona na linha pode cortar. Abaixo de ${R.pass.astrayThreshold}, o passe sai torto.`,
  sections: [
    {
      title: 'Tipos de passe',
      blocks: [
        {
          list: [
            `**${ACTION_LABEL.passe_pe}**: escolhe um aliado. A bola vai para onde ele **terminar** o movimento.`,
            `**${ACTION_LABEL.passe_espaco}**: escolhe uma casa. Um aliado que termine nela ou ao lado recebe com +${R.offBall.spaceReceptionBonus}. Se ninguém chegar, a bola fica solta ali.`,
            `**${ACTION_LABEL.tabela}**: os dois escolhem Tabela um com o outro. A bola vai e volta no mesmo lance. Se o parceiro não escolher Tabela com você, vira passe no pé comum.`,
          ],
        },
        `No passe no espaço, se mais de um aliado puder receber, a prioridade é: quem está na casa, depois quem escolheu ${ACTION_LABEL.desmarque}, depois o mais perto.`,
      ],
    },
    {
      title: 'A rolagem do passe',
      blocks: [
        '**Passe + d10**, menos a penalidade de distância e as penalidades gerais, mais os bônus de recepção:',
        {
          list: [
            `+${R.offBall.desmarqueReceptionBonus} se quem recebe escolheu ${ACTION_LABEL.desmarque};`,
            `+${R.offBall.spaceReceptionBonus} no passe no espaço, quando alguém recebe;`,
            `+${R.offBall.pedirBolaPassBonus} se quem recebe escolheu ${ACTION_LABEL.pedir_bola}.`,
          ],
        },
        `**Distância**: até metade do seu Passe (arredondado para baixo), sem custo. Acima disso, -1 a cada ${R.pass.penaltyEvery} casas ou fração.`,
        {
          table: {
            head: ['Passe', 'Livre até', ...passDists.map((d) => `A ${d} casas`)],
            rows: passValues.map((p) => [p, Math.floor(p / 2), ...passDists.map((d) => (passPenalty(p, d) ? `-${passPenalty(p, d)}` : '0'))]),
          },
        },
      ],
    },
    {
      title: 'Passe torto',
      blocks: [
        `Se a rolagem final ficar abaixo de ${R.pass.astrayThreshold}, a bola desvia 1 casa para uma direção aleatória (mais longe se a rolagem for muito ruim).`,
        { list: ['Se cair num jogador, ele fica com ela (se for adversário, conta como interceptação).', 'Se cair numa casa vazia, fica solta.', 'Se sair do campo, vai para o adversário de linha mais próximo, na casa da borda.'] },
      ],
    },
    {
      title: 'Interceptação',
      blocks: [
        'Todo adversário cuja zona encosta na linha do passe tenta cortar, na ordem em que aparece ao longo da linha. O primeiro que conseguir fica com a bola.',
        '**Defesa + d10** do defensor contra a rolagem do passe. Igual ou maior, cortou.',
        {
          list: [
            `+${R.offBall.fecharLinhaInterceptBonus} com ${ACTION_LABEL.fechar_linha}, e mais +${R.duel.matrixBonus} se estiver colado no passador;`,
            `+${R.duel.readBonus} com Leitura certa;`,
            `-${R.offBall.abrirLinhaInterceptPenalty} se um atacante escolheu ${ACTION_LABEL.abrir_linha} e é quem recebe ou está ao lado da linha;`,
            `goleiro só intercepta com Adiantar linha, e só nas casas coladas nele (+${R.goalkeeper.advanceInterceptBonus}).`,
          ],
        },
        { h: 'Passes que não podem ser cortados' },
        {
          list: [
            `Passe que termina na trilha de ${faixa.name} de um aliado.`,
            `A ação de bola com Ritmo cheio (${sk('ritmo_ginga').name}).`,
            `${curva.name} ignora ${curva.params.ignoreDefenders} defensor na linha.`,
          ],
        },
      ],
    },
    {
      title: 'Depois da recepção',
      blocks: [
        `Se quem recebe escolheu ${ACTION_LABEL.finalizar_primeira}, ele chuta na hora ([[chute-e-goleiro]]).`,
        'O passe certo fica registrado: se o recebedor fizer gol neste lance ou no próximo, é assistência.',
      ],
    },
  ],
  examples: [
    {
      title: 'Passe no pé com defensor na linha',
      figure: (
        <FigRow>
          <FieldDiagram
            step="Defensor em Mover"
            title="Passe com um defensor perto da linha"
            tokens={[
              { x: 4, y: 3, team: 'A', n: 10, tag: 'PAS 7' },
              { x: 8, y: 2, team: 'A', n: 9 },
              { x: 6, y: 4, team: 'B', n: 5, tag: 'DEF 6' },
            ]}
            zones={[{ x: 6, y: 4, r: 1, team: 'B' }]}
            arrows={[{ from: [4, 3], to: [8, 2], kind: 'pass', label: `rolagem ${exPassRoll}` }]}
          />
          <FieldDiagram
            step={`Defensor em ${ACTION_LABEL.fechar_linha}`}
            title="Mesmo passe contra fechar linha"
            tokens={[
              { x: 4, y: 3, team: 'A', n: 10, tag: 'PAS 7' },
              { x: 8, y: 2, team: 'A', n: 9 },
              { x: 6, y: 4, team: 'B', n: 5, tag: `+${R.offBall.fecharLinhaInterceptBonus}` },
            ]}
            zones={[{ x: 6, y: 4, r: 1, team: 'B' }]}
            arrows={[{ from: [4, 3], to: [6, 3], kind: 'blocked', label: 'cortado' }]}
          />
        </FigRow>
      ),
      text: `Passe 7 + d10 (6) - ${exPassPen} de distância (${exPassDist} casas, livre até ${Math.floor(7 / 2)}) = ${exPassRoll}. A zona do 5 encosta na linha. Ele rola Defesa 6 + d10 (5) = 11: não alcança. Se tivesse escolhido ${ACTION_LABEL.fechar_linha}, seriam ${11 + R.offBall.fecharLinhaInterceptBonus}: bola dele.`,
    },
    {
      title: 'Passe no espaço para quem se desmarca',
      figure: (
        <FieldDiagram
          title="Passe no espaço"
          tokens={[
            { x: 4, y: 4, team: 'A', n: 10, ball: true },
            { x: 6, y: 1, team: 'A', ghost: true },
            { x: 8, y: 2, team: 'A', n: 7, tag: 'DESMARQUE' },
          ]}
          marks={[{ x: 8, y: 1, tone: 'blue', label: 'alvo' }]}
          arrows={[
            { from: [6, 1], to: [8, 2], team: 'A' },
            { from: [4, 4], to: [8, 2], kind: 'pass', label: 'chega no 7' },
          ]}
        />
      ),
      text: `O 10 escolhe a casa marcada como alvo. O 7 termina ao lado dela com ${ACTION_LABEL.desmarque}: recebe com +${R.offBall.spaceReceptionBonus} do passe no espaço e +${R.offBall.desmarqueReceptionBonus} do desmarque. A bola sai direto para onde ele parou.`,
    },
    {
      title: 'Tabela',
      figure: (
        <FieldDiagram
          title="Tabela entre dois atacantes"
          tokens={[
            { x: 5, y: 3, team: 'A', n: 10, ball: true, tag: 'TABELA' },
            { x: 6, y: 5, team: 'A', n: 8, tag: 'TABELA' },
            { x: 6, y: 3, team: 'B', n: 4 },
          ]}
          arrows={[
            { from: [5, 3], to: [6, 5], kind: 'pass', label: 'vai' },
            { from: [6, 5], to: [5, 3], via: [[5.4, 4.2]], kind: 'pass', label: 'volta' },
          ]}
        />
      ),
      text: 'Os dois escolhem Tabela um com o outro. O 10 toca, o 8 devolve no mesmo lance. São dois passes: cada um pode ser cortado. Tabela completa dá +1 de Química para os dois.',
    },
  ],
  faq: [
    { q: 'O passe no pé vai para onde o aliado estava?', a: 'Não. Vai para onde ele termina o movimento naquele lance.' },
    { q: 'Posso passar para trás?', a: 'Pode. Qualquer direção vale; só a distância conta.' },
    { q: 'O goleiro pode sair jogando?', a: `Sim: com a bola, ele pode ${ACTION_LABEL.conduzir.toLowerCase()}, ${ACTION_LABEL.proteger.toLowerCase()}, dar ${ACTION_LABEL.passe_pe.toLowerCase()} ou ${ACTION_LABEL.passe_espaco.toLowerCase()}.` },
    { q: 'Dois defensores na linha?', a: 'Os dois tentam, na ordem da linha. O primeiro que conseguir fica com a bola.' },
  ],
  related: ['acoes-sem-bola-ataque', 'acoes-sem-bola-defesa', 'zona-de-controle'],
};

// ---------------------------------------------------------------------------
const cd = sk('chute_direto');
const peca = sk('peca_que_encaixa');

export const acoesAtaque: GuideDoc = {
  slug: 'acoes-sem-bola-ataque',
  summary: 'Quem não tem a bola decide o lance tanto quanto o portador. Sem bola, você cria linha de passe, atrapalha o marcador ou já prepara o chute.',
  sections: [
    {
      title: 'As ações',
      blocks: [
        {
          table: {
            head: ['Ação', 'Efeito'],
            rows: [
              [ACTION_LABEL.mover, 'Só anda até o destino.'],
              [ACTION_LABEL.desmarque, `Recebe passe com +${R.offBall.desmarqueReceptionBonus}. Se receber, o marcador que ficou para trás leva -${R.offBall.desmarqueMarkerPenalty} em tudo no lance seguinte.`],
              [ACTION_LABEL.abrir_linha, `Passes para você, ou que passam ao seu lado, sofrem -${R.offBall.abrirLinhaInterceptPenalty} na interceptação.`],
              [ACTION_LABEL.corta_luz, `Escolha um adversário colado em você: ele anda ${R.offBall.corteLuzMovePenalty} casa a menos no lance.`],
              [ACTION_LABEL.pedir_bola, `Marca visível só para o seu time. Passe para você: +${R.offBall.pedirBolaPassBonus} na rolagem e +${R.offBall.pedirBolaChemistry} de Química para os dois.`],
              [ACTION_LABEL.tabela, 'Combina com o portador: a bola vai e volta no mesmo lance.'],
              [ACTION_LABEL.finalizar_primeira, 'Escolha a zona do gol. Se receber a bola neste lance, chuta na hora.'],
            ],
          },
        },
      ],
    },
    {
      title: 'Desmarque',
      blocks: [
        `O marcador que leva a penalidade é quem estava em ${ACTION_LABEL.marcar} em você. Se ninguém estava, é o adversário de linha mais perto, se estiver por perto.`,
        'O desmarque só paga se você receber. Sem passe, é só movimento.',
      ],
    },
    {
      title: 'Chute de primeira',
      blocks: [
        'Você chuta de onde estiver quando a bola chegar, na zona que escolheu no planejamento. Não precisa estar com a bola no começo do lance.',
        `É a base de **${cd.name}** (+${cd.params.bonus}) e de **${peca.name}** (+${peca.params.bonus}, e o goleiro não escolhe zona), as duas do Isagi.`,
        'Gol de primeira também conta para a missão de Despertar do Isagi ([[arvore-e-despertares]]).',
      ],
    },
  ],
  examples: [
    {
      title: 'Desmarque nas costas do marcador',
      figure: (
        <FieldDiagram
          title="Desmarque"
          tokens={[
            { x: 4, y: 3, team: 'A', n: 10, ball: true },
            { x: 6, y: 5, team: 'A', ghost: true },
            { x: 8, y: 4, team: 'A', n: 9, tag: 'DESMARQUE' },
            { x: 7, y: 5, team: 'B', n: 3, tag: '-1 NO PRÓXIMO' },
          ]}
          arrows={[
            { from: [6, 5], to: [8, 4], team: 'A' },
            { from: [4, 3], to: [8, 4], kind: 'pass' },
          ]}
        />
      ),
      text: `O 9 dispara para as costas do 3 e recebe com +${R.offBall.desmarqueReceptionBonus}. O 3, que marcava, fica com -${R.offBall.desmarqueMarkerPenalty} em todas as rolagens do lance seguinte.`,
    },
    {
      title: 'Corta-luz para abrir o corredor',
      figure: (
        <FieldDiagram
          title="Corta-luz"
          tokens={[
            { x: 5, y: 2, team: 'A', n: 8, tag: 'CORTA-LUZ' },
            { x: 6, y: 2, team: 'B', n: 6, tag: `-${R.offBall.corteLuzMovePenalty} CASA` },
            { x: 4, y: 4, team: 'A', n: 10, ball: true },
          ]}
          arrows={[
            { from: [6, 2], to: [5, 4], kind: 'blocked', label: 'não chega' },
            { from: [4, 4], to: [7, 4], team: 'A' },
          ]}
        />
      ),
      text: `O 8 escolhe o 6, que está colado nele. O 6 perde ${R.offBall.corteLuzMovePenalty} casa de movimento e não chega a tempo de fechar o 10, que conduz pelo meio.`,
    },
    {
      title: 'Chute de primeira',
      figure: (
        <FieldDiagram
          title="Chute de primeira"
          tokens={[
            { x: 6, y: 5, team: 'A', n: 10, ball: true },
            { x: 7, y: 2, team: 'A', ghost: true },
            { x: 8, y: 3, team: 'A', n: 11, tag: 'DE PRIMEIRA' },
            { x: 10, y: 3, team: 'B', n: 1, keeper: true },
          ]}
          arrows={[
            { from: [7, 2], to: [8, 3], team: 'A' },
            { from: [6, 5], to: [8, 3], kind: 'pass' },
            { from: [8, 3], to: [10.8, 2.6], kind: 'shot', label: 'na hora' },
          ]}
        />
      ),
      text: `O 11 escolhe ${ACTION_LABEL.finalizar_primeira} e a zona do chute. O passe chega depois do movimento, e ele finaliza no mesmo instante, sem dar tempo para a defesa.`,
    },
  ],
  faq: [
    { q: 'Pedir a bola aparece para o adversário?', a: 'Não. A marca é só do seu time. Na revelação, o adversário vê apenas a sua seta de apoio.' },
    { q: 'Posso escolher Chute de primeira e não receber?', a: 'Pode. Aí você só se move. Nada acontece.' },
    { q: 'Corta-luz funciona em quem está a 2 casas?', a: 'Não. O adversário precisa estar colado em você no começo do lance.' },
  ],
  related: ['passe', 'acoes-sem-bola-defesa', 'chute-e-goleiro'],
};

// ---------------------------------------------------------------------------
const [boteAtk] = duelMatrix('driblar', 'bote');
const [, conterDef] = duelMatrix('driblar', 'conter');

export const acoesDefesa: GuideDoc = {
  slug: 'acoes-sem-bola-defesa',
  summary: 'Defender é escolher o duelo certo. Bote força o duelo mas perde para o drible. Conter espera e pune o drible. Fechar linha e Marcar tiram o passe do jogo.',
  sections: [
    {
      title: 'As ações',
      blocks: [
        {
          table: {
            head: ['Ação', 'Efeito'],
            rows: [
              [ACTION_LABEL.mover, 'Só anda. Não dispara duelo.'],
              [ACTION_LABEL.bote, `Custa ${R.stamina.boteCost} de fôlego. Dispara duelo com o portador na sua zona. Contra Driblar, o portador ganha +${boteAtk}. Se perder, você fica vendido (sem movimento no próximo lance).`],
              [ACTION_LABEL.conter, `Dispara duelo com o portador na sua zona. Contra Driblar, você ganha +${conterDef}. Não custa fôlego e não deixa vendido.`],
              [ACTION_LABEL.fechar_linha, `+${R.offBall.fecharLinhaInterceptBonus} para interceptar passes que cruzam sua zona. Colado no passador, mais +${R.duel.matrixBonus}.`],
              [ACTION_LABEL.marcar, 'Escolha um atacante: seu destino vira a casa ao lado do destino dele, se couber no seu alcance.'],
              [ACTION_LABEL.leitura, `Adivinhe a ação do portador. Acertou perto dele: +${R.duel.readBonus} e Flow ([[leitura]]).`],
            ],
          },
        },
      ],
    },
    {
      title: 'Bote ou Conter?',
      blocks: [
        'Os dois disparam o duelo. A diferença está na matriz ([[duelos]]):',
        { list: [`Portador vai **driblar**: Conter (+${conterDef} para você). Bote dá +${boteAtk} para ele.`, `Portador vai **conduzir**: os dois são neutros. Conter sai mais barato.`, `Portador vai **passar ou chutar**: Bote dá +${duelMatrix('passe_pe', 'bote')[0]} para ele; Conter é neutro.`, `Portador vai **proteger**: Bote dá +${duelMatrix('proteger', 'bote')[1]} para você, que empata com o bônus fixo dele.`] },
        'Sem Bote nem Conter, o portador que não dribla passa do seu lado sem duelo.',
      ],
    },
    {
      title: 'Goleiro humano',
      blocks: [
        'O goleiro tem ações próprias e sempre escolhe a zona do gol que vai cobrir. Veja [[chute-e-goleiro]].',
      ],
    },
  ],
  examples: [
    {
      title: 'Fechar linha colado no passador',
      figure: (
        <FieldDiagram
          title="Fechar linha"
          tokens={[
            { x: 4, y: 3, team: 'A', n: 10, ball: true },
            { x: 7, y: 1, team: 'A', n: 7 },
            { x: 5, y: 2, team: 'B', n: 6, tag: `+${R.offBall.fecharLinhaInterceptBonus + R.duel.matrixBonus}` },
          ]}
          zones={[{ x: 5, y: 2, r: 1, team: 'B' }]}
          arrows={[{ from: [4, 3], to: [5, 2.4], kind: 'blocked', label: 'cortado' }]}
        />
      ),
      text: `O 6 escolheu ${ACTION_LABEL.fechar_linha} colado no 10. Qualquer passe que cruze a zona dele tem +${R.offBall.fecharLinhaInterceptBonus + R.duel.matrixBonus} de interceptação.`,
    },
    {
      title: 'Marcar acompanha o atacante',
      figure: (
        <FieldDiagram
          title="Marcar"
          tokens={[
            { x: 5, y: 1, team: 'A', ghost: true },
            { x: 8, y: 1, team: 'A', n: 11 },
            { x: 6, y: 2, team: 'B', ghost: true },
            { x: 8, y: 2, team: 'B', n: 2, tag: 'MARCAR 11' },
          ]}
          arrows={[
            { from: [5, 1], to: [8, 1], team: 'A' },
            { from: [6, 2], to: [8, 2], team: 'B' },
          ]}
        />
      ),
      text: 'O 2 marca o 11. Ele não sabia para onde o 11 ia, mas o motor ajusta o destino: termina colado no destino do 11, na casa mais perto do caminho dele.',
    },
  ],
  faq: [
    { q: 'Bote é ruim então?', a: 'É situacional. Ele força o duelo contra quem conduz, passa ou chuta. Contra drible, perde.' },
    { q: 'Marcar funciona se o atacante for muito longe?', a: 'Você anda o que der do seu alcance na direção dele.' },
    { q: 'Posso dar bote em quem está a 2 casas?', a: 'Só se o portador entrar na sua zona durante o lance. A checagem é passo a passo.' },
  ],
  related: ['duelos', 'leitura', 'passe'],
};

// ---------------------------------------------------------------------------
export const leitura: GuideDoc = {
  slug: 'leitura',
  summary: `Leitura é apostar na ação do portador. Acertou e estava perto: +${R.duel.readBonus} em duelos e interceptações no lance e +${R.flow.readCorrect} de Flow. Errou: -${R.duel.readWrongInitiativePenalty} de iniciativa no lance seguinte.`,
  sections: [
    {
      title: 'Como funciona',
      blocks: [
        `Só quem defende pode ler. Escolha ${ACTION_LABEL.leitura} e um palpite: ${Object.values(READ_GUESS_LABEL).join(', ')}.`,
        { h: 'O que conta como cada palpite' },
        {
          table: {
            head: ['Ação do portador', 'Palpite certo'],
            rows: [
              [`${ACTION_LABEL.passe_pe}, ${ACTION_LABEL.passe_espaco}, ${ACTION_LABEL.tabela}`, READ_GUESS_LABEL.passe],
              [`${ACTION_LABEL.driblar}, ${ACTION_LABEL.conduzir}`, READ_GUESS_LABEL.drible],
              [ACTION_LABEL.chutar, READ_GUESS_LABEL.chute],
              [ACTION_LABEL.proteger, READ_GUESS_LABEL.proteger],
            ],
          },
        },
        { note: 'Conduzir conta como Drible para a Leitura.' },
      ],
    },
    {
      title: 'Perto o bastante',
      blocks: [
        `A Leitura só vale se você estiver a até ${R.duel.readRange} casas de uma destas:`,
        { list: ['o portador no começo do lance;', 'o destino do portador (medido do seu destino);', 'a linha do passe (medida do seu destino).'] },
        'Palpite certo mas longe: nada acontece, nem bônus nem penalidade.',
      ],
    },
    {
      title: 'O que muda',
      blocks: [
        { list: [`**Acertou perto**: +${R.duel.readBonus} em duelos e interceptações neste lance, +${R.flow.readCorrect} de Flow e conta para missões.`, `**Errou** (perto ou longe): -${R.duel.readWrongInitiativePenalty} na iniciativa do lance seguinte.`] },
        'A postura de Leitura aparece na revelação. O palpite não.',
        `Com o Ritmo cheio de ${sk('ritmo_ginga').name}, a ação do Lavinho não pode ser lida.`,
      ],
    },
  ],
  examples: [
    {
      title: 'Alcance da Leitura',
      figure: (
        <FieldDiagram
          title="Área em que a Leitura vale"
          tokens={[
            { x: 5, y: 3, team: 'A', n: 10, ball: true, focus: true },
            { x: 8, y: 1, team: 'B', n: 4, tag: `LEITURA: ${READ_GUESS_LABEL.drible.toUpperCase()}` },
            { x: 9, y: 5, team: 'B', n: 2 },
          ]}
          zones={[{ x: 5, y: 3, r: R.duel.readRange }]}
        />
      ),
      text: `A área tracejada é o raio de ${R.duel.readRange} casas em volta do portador. O 4 está dentro: se o 10 driblar ou conduzir, a Leitura acerta e o 4 ganha +${R.duel.readBonus}. O 2 está fora: mesmo acertando, só valeria se o destino dele ficasse perto do destino do 10 ou da linha do passe.`,
    },
  ],
  faq: [
    { q: 'Leitura substitui Bote ou Conter?', a: 'Não. Leitura não dispara duelo. O bônus vale se você entrar num duelo ou numa interceptação no mesmo lance.' },
    { q: 'Vale ler um passe longe da bola?', a: 'Vale, se o seu destino ficar perto da linha do passe.' },
    { q: 'Errar custa muito?', a: `Custa -${R.duel.readWrongInitiativePenalty} de iniciativa no lance seguinte. Pouco, mas decide casas disputadas.` },
  ],
  related: ['acoes-sem-bola-defesa', 'duelos', 'flow'],
};

// ---------------------------------------------------------------------------
const shotDists = Array.from({ length: 9 }, (_, i) => i + 2);
const ev = sk('chute_velocidade');
const ce = sk('corpo_elastico');
const exShotZone: GoalZone = 5;
const exKeeperZone: GoalZone = 4;

export const chuteEGoleiro: GuideDoc = {
  slug: 'chute-e-goleiro',
  summary: 'Chute é Chute + d10 contra o goleiro. Distância, ângulo e defensores na linha tiram pontos. O goleiro escolhe uma das 6 zonas: acertar a zona do chute vale muito para ele.',
  sections: [
    {
      title: 'A rolagem do chute',
      blocks: [
        '**Chute + d10**, depois do movimento, da casa onde você parou:',
        {
          list: [
            `**Distância** até a casa de gol mais próxima: livre até ${R.shot.freeDistance}, depois -1 a cada ${R.shot.penaltyEvery} casas ou fração.`,
            `**Ângulo**: -${R.shot.anglePenaltyPerRow} por linha fora da faixa do gol.`,
            `**Defensor na linha** entre você e o centro do gol: -${R.shot.defenderOnLinePenalty} cada.`,
            'Fôlego baixo e Desmarque: as penalidades gerais.',
            `Bônus de habilidade: ${ev.name}, ${cd.name}, ${peca.name}, Ego Desperto.`,
          ],
        },
        { table: { head: ['Distância', ...shotDists.map(String)], rows: [['Penalidade', ...shotDists.map((d) => (shotDistPenalty(d) ? `-${shotDistPenalty(d)}` : '0'))]] } },
      ],
    },
    {
      title: 'O goleiro',
      blocks: [
        '**(Físico + Visão) ÷ 2 + d10**, e o bônus da zona:',
        { list: [`+${R.shot.keeperExactZone} se escolheu a mesma zona do chute;`, `+${R.shot.keeperAdjacentZone} se escolheu uma zona vizinha (lado ou em cima/embaixo);`, `-${R.goalkeeper.advanceSavePenalty} se escolheu Adiantar linha.`] },
        '**Gol** se o chute passar a defesa. Empate é defesa. A bola defendida fica com o goleiro.',
        `Antes do goleiro, um defensor com ${ce.name} pode bloquear: Físico + d10 contra o chute.`,
        { h: 'As 6 zonas' },
        { figure: <GoalZones />, text: 'Zonas 0 a 2 embaixo, 3 a 5 em cima.' },
      ],
    },
    {
      title: 'Ações do goleiro humano',
      blocks: [
        {
          table: {
            head: ['Ação', 'Efeito'],
            rows: [
              [ACTION_LABEL.gk_posicionar, 'Anda dentro da área.'],
              [ACTION_LABEL.gk_sair, `Disputa bola solta na área, perto dele, com +${R.goalkeeper.rushLooseBonus}.`],
              [ACTION_LABEL.gk_adiantar, `Intercepta passes nas casas coladas com +${R.goalkeeper.advanceInterceptBonus}; defende chutes com -${R.goalkeeper.advanceSavePenalty}.`],
              [ACTION_LABEL.gk_comandar, `+${R.goalkeeper.commandBonus} de Defesa para um aliado dentro da área.`],
            ],
          },
        },
        'Em qualquer ação, ele escolhe a zona do gol que vai cobrir. A área tem ' + `${R.areaDepth} colunas de fundo e as linhas do gol mais ${R.areaExtraRows} para cada lado.`,
        'O goleiro bot observa as zonas que cada atacante mais usa. Quanto mais Visão, mais ele confia nisso.',
      ],
    },
    {
      title: 'Depois do chute',
      blocks: [
        { list: [`Gol: +${R.flow.goal} de Flow e +1 de Ego para quem marcou. A saída é de quem sofreu.`, `Defesa: +${R.flow.goalkeeperSave} de Flow para o goleiro.`, `Passe que vira finalização (no lance ou no seguinte): +${R.flow.passToShot} de Flow para quem passou, e assistência se virar gol.`] },
      ],
    },
  ],
  examples: [
    {
      title: 'Chute cruzado com defensor na linha',
      figure: (
        <FieldDiagram
          title="Chute com ângulo e defensor na linha"
          mode="3v3"
          crop={{ x0: 5, x1: 10, y0: 0, y1: 6 }}
          goalBand="B"
          tokens={[
            { x: 7, y: 1, team: 'A', n: 9, ball: true, tag: 'CHU 8' },
            { x: 9, y: 2, team: 'B', n: 4 },
            { x: 10, y: 3, team: 'B', n: 1, keeper: true },
          ]}
          marks={[{ x: 9, y: 2, tone: 'red', outline: true }]}
          arrows={[{ from: [7, 1], to: [10.8, 3], kind: 'shot' }]}
        />
      ),
      text: `O 9 chuta a 3 casas do gol: sem penalidade de distância. Ele está ${1} linha fora da faixa do gol: -${R.shot.anglePenaltyPerRow}. O 4 está na linha até o centro do gol: -${R.shot.defenderOnLinePenalty}. Conta: 8 + d10 - ${R.shot.anglePenaltyPerRow + R.shot.defenderOnLinePenalty}.`,
    },
    {
      title: 'Zona do chute contra zona do goleiro',
      figure: <GoalZones shot={exShotZone} keeper={exKeeperZone} />,
      text: `O chute vai no ${GOAL_ZONE_LABEL[exShotZone].toLowerCase()}. O goleiro escolheu o ${GOAL_ZONE_LABEL[exKeeperZone].toLowerCase()}, vizinho: ${zonesAdjacent(exKeeperZone, exShotZone) ? `+${R.shot.keeperAdjacentZone}` : '+0'} para ele. Se tivesse escolhido a zona certa, seriam +${R.shot.keeperExactZone}.`,
    },
  ],
  faq: [
    { q: 'Qual zona é vizinha?', a: 'As que dividem um lado: esquerda e direita na mesma altura, e em cima ou embaixo na mesma coluna. Diagonal não é vizinha.' },
    { q: 'Chutar de muito longe vale a pena?', a: `Cada ${R.shot.penaltyEvery} casas acima de ${R.shot.freeDistance} custam 1. Com Chute alto e o goleiro errando a zona, às vezes vale.` },
    { q: 'O goleiro pode fazer gol?', a: 'Ele pode conduzir e passar, mas não chutar.' },
    { q: 'Empate entre chute e goleiro?', a: 'É defesa.' },
  ],
  related: ['acoes-sem-bola-ataque', 'passe', 'linhagens'],
};

