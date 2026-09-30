import {
  ACTION_LABEL,
  DIFFICULTY_LABEL,
  LINEAGES,
  MATCH_RULES as R,
  PERSONALITY_LABEL,
  PROGRESSION,
  getSkill,
} from '@ego/content';
import { duelMatrix } from '@ego/engine';
import { ArrowLegend, FieldDiagram } from '@/components/field/FieldDiagram';
import { DuelMatrix } from '@/components/field/DuelMatrix';
import { FigRow } from '../figures';
import { moveRange } from '../data';
import type { GuideDoc } from '../types';

const reactionSkills = LINEAGES.flatMap((l) => l.skills.filter((s) => s.reaction).map((s) => ({ s, l })));
const sk = (id: string) => getSkill(id);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------------------
export const estruturaDoLance: GuideDoc = {
  slug: 'estrutura-do-lance',
  summary: `Cada lance tem três fases: planejamento em segredo, revelação das setas e resolução em passos. Todos decidem ao mesmo tempo. A ação exata de cada jogador só aparece quando o lance já está resolvendo.`,
  sections: [
    {
      title: 'Planejamento',
      blocks: [
        `Todos os jogadores escolhem ao mesmo tempo, sem ver ninguém: **destino** (a casa para onde vão), **ação** e, se quiserem, uma **habilidade**, o **Flow** e o **sprint**.`,
        `O tempo padrão é de ${R.planSeconds.default} segundos. O servidor pode ajustar entre ${R.planSeconds.min} e ${R.planSeconds.max}.`,
        `Quem não planeja a tempo fica no automático: a IA joga por você no nível ${DIFFICULTY_LABEL.regular}, perfil ${PERSONALITY_LABEL.cauteloso}, sem usar Flow. Esse lance não conta como ação própria, e isso pesa nas recompensas ([[limites-diarios]]).`,
        { note: 'Plano inválido não trava o lance. Destino fora do alcance ou fôlego que não fecha a conta viram "ficar parado". Confira antes de confirmar.', tone: 'warn' },
      ],
    },
    {
      title: 'Revelação',
      blocks: [
        'Quando todos confirmam (ou o tempo acaba), as setas aparecem. Cada seta mostra de onde o jogador sai e para onde vai.',
        { h: 'O que fica público' },
        {
          list: [
            '**O destino** de cada jogador (a seta).',
            '**A categoria da seta**: ataque (quem tem a bola), apoio (companheiros do portador), defesa (quem marca) e goleiro.',
            '**Quem usou habilidade ou Flow** (não qual efeito vai acontecer).',
            '**Quem está em Leitura**: a postura é visível. O palpite, não.',
            '**Quem deu sprint**.',
          ],
        },
        { h: 'O que continua secreto' },
        { list: ['A ação exata (passe, drible, chute, bote...).', 'O alvo do passe.', 'A zona do chute e a zona que o goleiro cobre.', 'O palpite da Leitura.'] },
      ],
    },
    {
      title: 'Janela de reação',
      blocks: [
        `Se alguém ativou uma habilidade de reação, abre uma janela de ${R.reactionSeconds} segundos entre a revelação e a resolução. Sem habilidade de reação no lance, não há janela.`,
        {
          table: {
            head: ['Habilidade', 'Linhagem', 'O que muda'],
            rows: reactionSkills.map(({ s, l }) => [s.name, l.name, s.describe(s.params, { stamina: s.stamina, cooldown: s.cooldown })]),
          },
        },
        'Bots reagem com a mesma informação que a habilidade revela. Ninguém vê mais do que o texto da habilidade diz.',
      ],
    },
    {
      title: 'Resolução',
      blocks: [
        'A resolução segue sempre esta ordem:',
        {
          ordered: true,
          list: [
            'Habilidades são ativadas e os custos de fôlego são pagos. Sprint e Bote também cobram aqui.',
            'Todos rolam **iniciativa** (Velocidade + d10).',
            '**Leituras** são conferidas.',
            'Duelos de quem já começa dentro de uma zona (passo 0).',
            'Movimento em passos: todos andam 1 casa por passo, e os duelos são checados depois de cada passo.',
            `Quem usou ${sk('arranque_tardio').name} anda por último, com metade do movimento.`,
            '**Ação de bola**: passe, tabela ou chute. Sempre depois do movimento, a partir da casa onde o portador parou.',
            'Bola solta na área: o goleiro que escolheu Sair do gol disputa.',
            `Fim do lance: todos recuperam ${R.stamina.regenPerTurn} de fôlego.`,
          ],
        },
        `A partida tem ${R.halves} tempos de ${R.turnsPerHalf} lances. O segundo tempo começa com a bola do time B. Depois de um gol, a saída é no centro, com a bola de quem sofreu. Na partida rápida, quem fizer ${R.quickFirstTo} gols primeiro vence.`,
      ],
    },
  ],
  examples: [
    {
      title: 'Um lance, três fases',
      figure: (
        <>
          <FigRow>
            <FieldDiagram
              step="1 / Planejamento"
              title="Planejamento: ninguém vê nada"
              tokens={[
                { x: 3, y: 3, team: 'A', n: 10, ball: true, tag: '?' },
                { x: 5, y: 1, team: 'A', n: 7, tag: '?' },
                { x: 8, y: 3, team: 'B', n: 5, tag: '?' },
                { x: 8, y: 5, team: 'B', n: 3, tag: '?' },
                { x: 10, y: 3, team: 'B', n: 1, keeper: true },
              ]}
            />
            <FieldDiagram
              step="2 / Revelação"
              title="Revelação: só as setas"
              tokens={[
                { x: 3, y: 3, team: 'A', n: 10, ball: true, tag: 'ATAQUE' },
                { x: 5, y: 1, team: 'A', n: 7, tag: 'APOIO' },
                { x: 8, y: 3, team: 'B', n: 5, tag: 'DEFESA' },
                { x: 8, y: 5, team: 'B', n: 3, tag: 'LEITURA' },
                { x: 10, y: 3, team: 'B', n: 1, keeper: true },
              ]}
              arrows={[
                { from: [3, 3], to: [5, 4], team: 'A' },
                { from: [5, 1], to: [7, 1], team: 'A' },
                { from: [8, 3], to: [7, 3], team: 'B' },
                { from: [8, 5], to: [7, 4], team: 'B' },
              ]}
            />
            <FieldDiagram
              step="3 / Resolução"
              title="Resolução: movimento e depois o passe"
              tokens={[
                { x: 3, y: 3, team: 'A', ghost: true },
                { x: 5, y: 1, team: 'A', ghost: true },
                { x: 8, y: 3, team: 'B', ghost: true },
                { x: 8, y: 5, team: 'B', ghost: true },
                { x: 5, y: 4, team: 'A', n: 10 },
                { x: 7, y: 1, team: 'A', n: 7, ball: true },
                { x: 7, y: 3, team: 'B', n: 5 },
                { x: 7, y: 4, team: 'B', n: 3 },
                { x: 10, y: 3, team: 'B', n: 1, keeper: true },
              ]}
              arrows={[{ from: [5, 4], to: [7, 1], kind: 'pass', label: 'passe no pé' }]}
            />
          </FigRow>
          <ArrowLegend kinds={['move', 'pass']} />
        </>
      ),
      text: `Na revelação, a defesa vê que o 10 vai para a frente e o 7 corre pela ponta, mas não sabe se o 10 vai conduzir, driblar ou passar. O 3 está em Leitura: todos veem a postura, ninguém vê o palpite. Na resolução, todos andam primeiro. Só depois o 10 passa, da casa onde parou. O 5 e o 3 têm a zona na linha do passe e tentam cortar, na ordem da linha.`,
    },
    {
      title: `${sk('arranque_tardio').name}: escolher depois de ver`,
      figure: (
        <FieldDiagram
          title="Arranque Tardio"
          tokens={[
            { x: 6, y: 1, team: 'A', n: 11, tag: 'ARRANQUE' },
            { x: 5, y: 4, team: 'A', n: 10, ball: true },
            { x: 7, y: 2, team: 'B', n: 4 },
            { x: 10, y: 3, team: 'B', n: 1, keeper: true },
          ]}
          arrows={[
            { from: [7, 2], to: [7, 1], team: 'B', label: 'fecha a ponta' },
            { from: [6, 1], to: [7, 2], kind: 'late' },
          ]}
        />
      ),
      text: `O 11 ativa ${sk('arranque_tardio').name}. Na janela de reação ele vê todos os destinos e percebe que o 4 vai subir para fechar a ponta. Ele escolhe justamente a casa que o 4 vai deixar. Como anda depois de todos, a casa já está livre. O preço: metade do movimento normal (${Math.max(1, Math.floor(moveRange(7) * sk('arranque_tardio').params.moveFraction))} casa com Velocidade 7).`,
    },
  ],
  faq: [
    { q: 'Posso trocar o plano depois de ver as setas?', a: 'Só com uma habilidade de reação ativa naquele lance, e só o que ela permite (destino, ação ou os dois).' },
    { q: 'E se dois jogadores escolherem a mesma casa?', a: 'Quem tem mais iniciativa entra primeiro. O outro fica travado naquele passo. Veja [[movimento-e-iniciativa]].' },
    { q: 'O passe sai antes ou depois do movimento?', a: 'Depois. O portador anda até o destino (parando na borda de zonas, se não estiver driblando) e passa ou chuta de lá.' },
    { q: 'A IA joga por mim se eu cair?', a: `Sim. Ela assume no nível ${DIFFICULTY_LABEL.regular}, sem Flow. O lance não conta como ação própria.` },
  ],
  related: ['movimento-e-iniciativa', 'zona-de-controle', 'duelos', 'passe'],
};

// ---------------------------------------------------------------------------
const velRange = Array.from({ length: PROGRESSION.attrMax + PROGRESSION.equipmentOverCap - PROGRESSION.attrStart + 1 }, (_, i) => PROGRESSION.attrStart + i);
const arr = sk('arrancada');
const pan = sk('pantera_vermelha');
const salto = sk('salto_imprevisivel');

export const movimento: GuideDoc = {
  slug: 'movimento-e-iniciativa',
  summary: `Você anda até ${R.movement.base} casas, mais 1 a cada ${R.movement.velocityDivisor} pontos de Velocidade, em qualquer direção. Diagonal conta como 1 casa. Todos andam juntos, 1 passo por vez, e a iniciativa decide quem entra primeiro numa casa disputada.`,
  sections: [
    {
      title: 'Alcance',
      blocks: [
        `Alcance = ${R.movement.base} + Velocidade ÷ ${R.movement.velocityDivisor} (arredondado para baixo). O campo é uma grade: andar na diagonal custa o mesmo que andar reto.`,
        { table: { head: ['Velocidade', 'Casas por lance', 'Com sprint'], rows: velRange.map((v) => [v, moveRange(v), moveRange(v) + R.movement.sprintBonus]) } },
        `**Sprint**: +${R.movement.sprintBonus} casas, custa ${R.stamina.sprintCost} de fôlego. Só funciona se você tiver esse fôlego no começo do lance.`,
        { h: 'Habilidades que mexem no alcance' },
        {
          list: [
            `**${arr.name}**: +${arr.params.cells} casas.`,
            `**${pan.name}**: move ${pan.params.moveMultiplier}x a distância normal.`,
            `**${salto.name}**: garante pelo menos ${salto.params.cells} casas e ignora zonas.`,
            `**${sk('arranque_tardio').name}**: metade do movimento, andando depois de todos.`,
            `**${ACTION_LABEL.corta_luz}** de um adversário ao seu lado: -${R.offBall.corteLuzMovePenalty} casa.`,
          ],
        },
      ],
    },
    {
      title: 'O caminho',
      blocks: [
        'O jogador segue a linha reta até o destino, 1 casa por passo. Não dá para desenhar curva: se quiser contornar alguém, escolha outro destino.',
        { list: ['Goleiro nunca sai da própria área.', `${ACTION_LABEL.proteger} fica parado com a bola.`, `${ACTION_LABEL.marcar} ajusta o destino sozinho: termina colado no destino do atacante marcado, se couber no alcance.`, 'Quem está vendido ou caído não anda no lance.'] },
      ],
    },
    {
      title: 'Passos simultâneos e casas ocupadas',
      blocks: [
        'A cada passo, todos avançam 1 casa ao mesmo tempo. Ninguém entra numa casa ocupada. Quando duas pessoas querem a mesma casa, entra quem tem mais iniciativa.',
        'Quem fica travado perde aquele passo. Se a casa liberar no passo seguinte, ele continua.',
        'Bola solta: quem pisa na casa da bola pega e para ali.',
      ],
    },
    {
      title: 'Iniciativa',
      blocks: [
        'No começo da resolução, cada jogador rola **Velocidade + d10**. A ordem vale para o lance inteiro.',
        `Quem errou uma Leitura no lance anterior tem -${R.duel.readWrongInitiativePenalty} na iniciativa.`,
        'A iniciativa também define a ordem dos duelos quando o portador entra na zona de dois defensores no mesmo passo.',
      ],
    },
    {
      title: 'Portador e zonas',
      blocks: ['Quem está com a bola e não escolheu Driblar para na borda da zona de um adversário. Driblar atravessa, e cada zona atravessada é um duelo. Detalhes em [[zona-de-controle]].'],
    },
  ],
  examples: [
    {
      title: `Alcance com Velocidade 7`,
      figure: (
        <FieldDiagram
          title="Casas alcançáveis com Velocidade 7"
          tokens={[{ x: 5, y: 3, team: 'A', n: 8, focus: true }]}
          marks={Array.from({ length: 7 }, (_, dy) => dy - 3)
            .flatMap((dy) => Array.from({ length: 7 }, (_, dx) => dx - 3).map((dx) => ({ x: 5 + dx, y: 3 + dy })))
            .filter((c) => c.x >= 0 && c.x <= 10 && c.y >= 0 && c.y <= 6 && !(c.x === 5 && c.y === 3))
            .map((c) => ({ ...c, tone: 'blue' as const }))}
        />
      ),
      text: `Com Velocidade 7, o alcance é ${moveRange(7)} casas (${R.movement.base} + ${Math.floor(7 / R.movement.velocityDivisor)}). As casas marcadas são todas as que ele pode escolher como destino, inclusive nas diagonais.`,
    },
    {
      title: 'Casa disputada',
      figure: (
        <FieldDiagram
          title="Dois jogadores querem a mesma casa"
          tokens={[
            { x: 4, y: 2, team: 'A', n: 7, tag: 'INIC 14' },
            { x: 8, y: 2, team: 'B', n: 4, tag: 'INIC 11' },
            { x: 5, y: 4, team: 'A', n: 10, ball: true },
          ]}
          arrows={[
            { from: [4, 2], to: [6, 2], team: 'A' },
            { from: [8, 2], to: [6, 2], kind: 'blocked', label: 'travado' },
          ]}
          marks={[{ x: 6, y: 2, tone: 'amber', outline: true }]}
        />
      ),
      text: 'O 7 e o 4 escolheram a mesma casa. Os dois chegam ao lado dela no mesmo passo. O 7 rolou mais iniciativa e entra primeiro. O 4 fica travado na casa anterior e perde o passo.',
    },
  ],
  faq: [
    { q: 'Diagonal custa mais?', a: 'Não. Qualquer uma das 8 direções custa 1 casa.' },
    { q: 'Posso atravessar um jogador?', a: 'Não. Casa ocupada bloqueia. Você espera no passo e segue se ela liberar.' },
    { q: 'Sprint com pouco fôlego funciona?', a: `Só se você tiver pelo menos ${R.stamina.sprintCost} de fôlego. Sem isso, o sprint é ignorado.` },
    { q: 'O goleiro corre atrás da bola fora da área?', a: 'Não. O caminho dele é cortado na borda da área.' },
  ],
  related: ['zona-de-controle', 'folego', 'estrutura-do-lance'],
};

// ---------------------------------------------------------------------------
const muralha = sk('muralha_viva');

export const zonaDeControle: GuideDoc = {
  slug: 'zona-de-controle',
  summary: 'Todo jogador de linha controla as 8 casas ao redor. Goleiro não tem zona. A zona para quem conduz, dispara duelos e ajuda a cortar passes.',
  sections: [
    {
      title: 'Tamanho da zona',
      blocks: [
        'A zona é o anel de casas vizinhas, incluindo as diagonais. Ela anda junto com o jogador, passo a passo.',
        { list: [`**${muralha.name}** (Flow de Gagamaru): raio ${muralha.params.radius} por ${muralha.params.turns} lances.`, 'Quem está **caído** (Carrinho que falhou) não tem zona no lance seguinte.', 'Goleiros não têm zona e não duelam.'] },
      ],
    },
    {
      title: 'Portador contra zona',
      blocks: [
        `Com ${ACTION_LABEL.conduzir}, passe ou chute, o portador **para na borda** antes de entrar numa zona adversária. Se ele já começou o lance dentro da zona, segue andando.`,
        `Com ${ACTION_LABEL.driblar}, ele atravessa. Cada zona atravessada é um duelo contra aquele defensor.`,
        `${sk('faixa_aceleracao').name} e ${salto.name} ignoram zonas no movimento.`,
      ],
    },
    {
      title: 'Quando a zona vira duelo',
      blocks: [
        'Há duelo quando o portador está dentro da zona de um defensor e acontece uma destas:',
        { list: [`o portador escolheu **${ACTION_LABEL.driblar}**;`, `o defensor escolheu **${ACTION_LABEL.bote}**;`, `o defensor escolheu **${ACTION_LABEL.conter}**.`] },
        'Cada par portador e defensor duela no máximo uma vez por lance. A checagem acontece no passo 0 e depois de cada passo de movimento.',
        'Um defensor que só escolheu Mover não duela, mesmo com o portador colado nele.',
      ],
    },
    {
      title: 'Zona e passe',
      blocks: ['Todo adversário cuja zona encosta na linha do passe pode tentar interceptar. Veja [[passe]].'],
    },
  ],
  examples: [
    {
      title: 'Conduzir para na borda',
      figure: (
        <FieldDiagram
          title="Conduzir para na borda da zona"
          tokens={[
            { x: 2, y: 3, team: 'A', ghost: true },
            { x: 4, y: 3, team: 'A', n: 10, ball: true, tag: 'CONDUZIR' },
            { x: 6, y: 3, team: 'B', n: 5 },
          ]}
          zones={[{ x: 6, y: 3, r: 1, team: 'B' }]}
          arrows={[
            { from: [2, 3], to: [4, 3], team: 'A' },
            { from: [4, 3], to: [5, 3], kind: 'blocked', label: 'zona' },
          ]}
        />
      ),
      text: 'O 10 queria chegar na casa ao lado do 5 conduzindo. A próxima casa estava na zona do 5 e ele ainda estava fora dela, então parou na borda. Sem duelo: o 5 escolheu Mover.',
    },
    {
      title: 'Driblar atravessa',
      figure: (
        <FieldDiagram
          title="Driblar atravessa a zona e gera duelo"
          tokens={[
            { x: 2, y: 3, team: 'A', ghost: true },
            { x: 6, y: 4, team: 'A', n: 10, ball: true, tag: 'DRIBLAR' },
            { x: 5, y: 3, team: 'B', n: 5 },
          ]}
          zones={[{ x: 5, y: 3, r: 1, team: 'B' }]}
          arrows={[{ from: [2, 3], to: [6, 4], kind: 'dribble', team: 'A', label: 'duelo' }]}
        />
      ),
      text: 'Com Driblar, o 10 entra na zona do 5. Acontece um duelo de drible ali mesmo. Se o 10 vencer, segue até o destino; se perder, o 5 fica com a bola.',
    },
    {
      title: `${muralha.name}: zona de raio ${muralha.params.radius}`,
      figure: (
        <FieldDiagram
          title="Zona ampliada"
          tokens={[
            { x: 8, y: 3, team: 'B', n: 2, tag: 'FLOW' },
            { x: 4, y: 3, team: 'A', n: 9, ball: true },
          ]}
          zones={[{ x: 8, y: 3, r: muralha.params.radius, team: 'B' }]}
        />
      ),
      text: `Com ${muralha.name}, a zona do Gagamaru cobre ${(2 * muralha.params.radius + 1) ** 2 - 1} casas. Quem conduz para bem mais longe dele, e qualquer bote dele alcança o portador a ${muralha.params.radius} casas.`,
    },
  ],
  faq: [
    { q: 'A zona impede defensores e companheiros de andar?', a: 'Não. Só o portador que não dribla para na borda. O que bloqueia qualquer um é casa ocupada.' },
    { q: 'Zonas de dois defensores sobrepostas?', a: 'Cada defensor é um duelo separado, na ordem de iniciativa. Se o portador perder o primeiro, acabou.' },
    { q: 'A área do goleiro é zona?', a: 'Não. A área só limita o goleiro e define onde ele disputa bola solta.' },
  ],
  related: ['duelos', 'movimento-e-iniciativa', 'passe'],
};

// ---------------------------------------------------------------------------
const [dbAtk] = duelMatrix('driblar', 'bote');
const [, dcDef] = duelMatrix('driblar', 'conter');
const carr = sk('carrinho');
const cob = sk('cobertura');

export const duelos: GuideDoc = {
  slug: 'duelos',
  summary: 'Duelo é rolagem contra rolagem: atributo + d10 + bônus da matriz. O portador só vence se tirar mais. Empate é da defesa.',
  sections: [
    {
      title: 'Quando acontece',
      blocks: [`Portador dentro da zona do defensor e: portador em ${ACTION_LABEL.driblar}, ou defensor em ${ACTION_LABEL.bote} ou ${ACTION_LABEL.conter}. Um duelo por par, por lance. Detalhes em [[zona-de-controle]].`],
    },
    {
      title: 'A conta do portador',
      blocks: [
        {
          list: [
            `${ACTION_LABEL.driblar} ou ${ACTION_LABEL.conduzir}: **Drible** + d10.`,
            `${ACTION_LABEL.proteger}: **Físico** + d10 + ${R.duel.protectBonus} fixo.`,
            'Passando (passe no pé, no espaço, tabela): **Passe** + d10.',
            `${ACTION_LABEL.chutar}: **Chute** + d10.`,
          ],
        },
        `Somam-se o bônus da matriz e as penalidades: -${R.stamina.lowPenalty} com fôlego abaixo de ${R.stamina.lowThreshold}, -${R.offBall.desmarqueMarkerPenalty} se um Desmarque te deixou para trás no lance anterior.`,
      ],
    },
    {
      title: 'A conta do defensor',
      blocks: [
        '**Defesa** + d10 + bônus da matriz, e ainda:',
        {
          list: [
            `+${R.duel.readBonus} se acertou a Leitura neste lance ([[leitura]]);`,
            `+${R.goalkeeper.commandBonus} se o goleiro humano deu Comandar nele e ele está na área;`,
            `+${carr.params.bonus} no Bote com ${carr.name};`,
            'as mesmas penalidades de fôlego e Desmarque.',
          ],
        },
      ],
    },
    {
      title: 'A matriz',
      blocks: [
        'A escolha de cada lado dá vantagem. A tabela abaixo sai direto do motor do jogo.',
        { figure: <DuelMatrix />, text: 'Matriz de duelo: driblar contra bote, conter e outras ações.' },
        `Proteger contra Bote fica neutro: o defensor ganha ${duelMatrix('proteger', 'bote')[1]} da matriz, mas o portador já tem os ${R.duel.protectBonus} fixos do Proteger. Contra Conter, o Proteger sai na frente.`,
      ],
    },
    {
      title: 'Resultado',
      blocks: [
        { list: ['**Portador vence** (rolagem maior): fica com a bola e segue. O defensor para de andar naquele lance.', '**Defensor vence** (maior ou igual): rouba a bola. Os dois param onde estão.'] },
        `Defensor que perde depois de dar Bote fica **vendido**: não anda no lance seguinte. Com ${carr.name}, fica **caído**: não anda e não tem zona no lance seguinte.`,
        `Drible vencido vale +${R.flow.dribbleWon} de Flow e +1 de Ego.`,
        { h: 'Casos especiais' },
        {
          list: [
            `**${cob.name}** (Kuon): se o aliado escolhido perder o duelo e Kuon estiver a até ${cob.params.range} casas do portador, Kuon disputa com +${cob.params.bonus}.`,
            `**${pan.name}** (Chigiri): com a bola, todo duelo dele usa a vantagem de ataque, seja qual for a escolha do defensor.`,
            `**${sk('samba_livre').name}** (Lavinho): +${sk('samba_livre').params.bonus} em até ${sk('samba_livre').params.duels} duelos de drible no mesmo lance.`,
          ],
        },
      ],
    },
  ],
  examples: [
    {
      title: `${ACTION_LABEL.driblar} contra ${ACTION_LABEL.bote}`,
      figure: (
        <FieldDiagram
          title="Drible contra bote"
          tokens={[
            { x: 3, y: 3, team: 'A', ghost: true },
            { x: 6, y: 3, team: 'A', n: 10, ball: true, tag: 'DRE 7' },
            { x: 5, y: 2, team: 'B', n: 4, tag: 'DEF 6 · BOTE' },
          ]}
          zones={[{ x: 5, y: 2, r: 1, team: 'B' }]}
          arrows={[{ from: [3, 3], to: [6, 3], kind: 'dribble', team: 'A', label: `+${dbAtk} matriz` }]}
        />
      ),
      text: `Drible 7 + d10 (tirou 5) + ${dbAtk} da matriz = ${7 + 5 + dbAtk}. Defesa 6 + d10 (tirou 7) + 0 = 13. O 10 vence por ${7 + 5 + dbAtk - 13} e segue. O 4 deu Bote e perdeu: fica vendido no próximo lance.`,
    },
    {
      title: `${ACTION_LABEL.driblar} contra ${ACTION_LABEL.conter}`,
      figure: (
        <FieldDiagram
          title="Drible contra conter"
          tokens={[
            { x: 2, y: 4, team: 'A', ghost: true },
            { x: 4, y: 4, team: 'A', n: 10, ball: true, tag: 'DRE 7' },
            { x: 5, y: 2, team: 'B', n: 4, tag: 'DEF 6 · CONTER' },
          ]}
          zones={[{ x: 5, y: 2, r: 1, team: 'B' }]}
          arrows={[
            { from: [2, 4], to: [4, 4], kind: 'dribble', team: 'A' },
            { from: [4, 4], to: [6, 3], kind: 'blocked', label: `+${dcDef} defesa` },
          ]}
        />
      ),
      text: `Agora o 4 escolheu Conter. Drible 7 + d10 (5) = 12. Defesa 6 + d10 (4) + ${dcDef} = ${6 + 4 + dcDef}. Empate: a bola é do 4. Conter é a resposta certa para quem vive de drible.`,
    },
  ],
  faq: [
    { q: 'Empate é de quem?', a: 'Da defesa. O portador precisa tirar mais.' },
    { q: 'Posso duelar com dois defensores no mesmo lance?', a: 'Sim, um de cada vez, na ordem de iniciativa. Perdeu um, a jogada acaba ali.' },
    { q: 'Goleiro duela?', a: 'Não. Goleiro só defende chutes, intercepta com Adiantar linha e disputa bola solta na área.' },
    { q: 'Leitura vale no duelo?', a: `Vale. Leitura certa dá +${R.duel.readBonus} ao defensor naquele lance.` },
  ],
  related: ['zona-de-controle', 'leitura', 'acoes-sem-bola-defesa'],
};
