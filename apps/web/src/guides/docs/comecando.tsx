import {
  ATTR_LABEL,
  ATTRS,
  ENERGY,
  FOOT_LABEL,
  GACHA,
  GAME,
  MARKET_VALUE,
  POSITION_LABEL,
  PROGRESSION,
  SITE_PATHS,
} from '@ego/content';
import { NO_LINEAGE_CAP } from '@ego/db';
import { FieldDiagram } from '@/components/field/FieldDiagram';
import { MAX_ACTIVE } from '@/lib/loadout-rules';
import { NAME_LIMITS, NUMBER_LIMITS } from '../data';
import type { GuideDoc } from '../types';

export const primeirosPassos: GuideDoc = {
  slug: 'primeiros-passos',
  summary: `${GAME.name} é futebol tático em grade, jogado no Discord. Você cria um jogador, recebe uma linhagem, joga partidas por lances e evolui. O site é a sua ficha: aqui você distribui pontos, compra nós da árvore e acompanha o ranking.`,
  sections: [
    {
      title: 'Os cinco primeiros movimentos',
      blocks: [
        {
          ordered: true,
          list: [
            'No servidor, use **/criar-personagem**: nome, número, posição, pé e cor do token ([[criacao-de-personagem]]).',
            `Use **/girar**. O primeiro giro é grátis e já equipa a linhagem que sair ([[giro-de-linhagem]]). Sem linhagem, o teto de tudo é ${NO_LINEAGE_CAP}.`,
            `Faça treinos rápidos com **/treino**. Cada um gasta ${ENERGY.trainingCost} de energia e dá fichas e XP ([[treinos]]).`,
            'Entre no **Modo Seleção** com **/selecao**. São partidas contra bots, em etapas ([[modo-selecao]]).',
            'Quando se sentir pronto, **/fila ranqueada** ou **/partida criar** para jogar contra gente.',
          ],
        },
      ],
    },
    {
      title: 'O que fazer no site',
      blocks: [
        {
          table: {
            head: ['Aba', 'Para que serve'],
            rows: [
              ['Perfil', 'Card, nível, valor de mercado, ranking e estatísticas.'],
              ['Personagem / Atributos', 'Distribuir Pontos de Atributo.'],
              ['Personagem / Linhagem', 'Comprar nós da árvore. É o único lugar onde isso acontece.'],
              ['Personagem / Loadout', `Escolher as ${MAX_ACTIVE} ativas e o Flow que vão para o campo.`],
              ['Inventário', 'Equipamentos, cosméticos e materiais.'],
              ['Progresso', 'Missões, Despertares, maestria e Modo Seleção.'],
              ['Giro', 'Giro de linhagem com o registro de cada sorteio.'],
              ['Ranking', 'Tabela do seu servidor, Solo e Time.'],
              ['Partidas', 'Histórico e replay lance por lance.'],
            ],
          },
        },
      ],
    },
    {
      title: 'Como uma partida funciona, em uma frase',
      blocks: ['Todos planejam em segredo, as setas aparecem, e o lance resolve em passos. Comece por [[estrutura-do-lance]], depois [[movimento-e-iniciativa]] e [[duelos]].'],
    },
  ],
  examples: [
    {
      title: 'Seu primeiro lance',
      figure: (
        <FieldDiagram
          title="Primeiro lance"
          mode="1v1"
          tokens={[
            { x: 5, y: 3, team: 'A', n: 10, ball: true, focus: true, tag: 'VOCÊ' },
            { x: 7, y: 3, team: 'B', n: 4 },
            { x: 0, y: 3, team: 'A', n: 1, keeper: true },
            { x: 10, y: 3, team: 'B', n: 1, keeper: true },
          ]}
          arrows={[{ from: [5, 3], to: [6, 1], team: 'A', label: 'conduzir' }]}
        />
      ),
      text: 'Na saída, você começa no centro com a bola. Um bom primeiro lance é conduzir para longe do marcador. Conduzindo, você não entra na zona dele; só há duelo se ele vier até você com Bote ou Conter.',
    },
  ],
  faq: [
    { q: 'Preciso do site para jogar?', a: 'Não. As partidas acontecem no Discord. O site é onde você organiza o personagem e compra nós da árvore.' },
    { q: 'Posso ter dois personagens?', a: 'Não. É um personagem por conta do Discord, preso ao servidor onde foi criado.' },
    { q: 'Perdi tudo?', a: 'Só a administração do servidor apaga personagens. Fale com ela.' },
  ],
  related: ['criacao-de-personagem', 'comandos-do-bot', 'estrutura-do-lance'],
};

export const criacao: GuideDoc = {
  slug: 'criacao-de-personagem',
  summary: `Na criação você escolhe nome, número da camisa, posição, pé dominante e a cor do token. Todo mundo começa igual: atributos em ${PROGRESSION.attrStart}, nível 1 e um giro grátis.`,
  sections: [
    {
      title: 'Escolhas',
      blocks: [
        {
          table: {
            head: ['Campo', 'Regra'],
            rows: [
              ['Nome', `De ${NAME_LIMITS[0]} a ${NAME_LIMITS[1]} caracteres. Letras, números, espaço, ponto, hífen e apóstrofo.`],
              ['Número', `De ${NUMBER_LIMITS[0]} a ${NUMBER_LIMITS[1]}.`],
              ['Posição', Object.values(POSITION_LABEL).join(', ')],
              ['Pé dominante', Object.values(FOOT_LABEL).join(', ')],
              ['Cor do token', 'Qualquer cor em hexadecimal. É a cor do seu jogador no campo e do seu retrato padrão.'],
            ],
          },
        },
        'A posição orienta a IA quando ela joga por você e o seu papel no time.',
      ],
    },
    {
      title: 'Ponto de partida',
      blocks: [
        {
          list: [
            `Todos os atributos em ${PROGRESSION.attrStart}: ${ATTRS.map((k) => ATTR_LABEL[k]).join(', ')}.`,
            `Energia cheia: ${ENERGY.max}.`,
            `Valor de mercado inicial: ${GAME.commonCurrency.short} ${MARKET_VALUE.start.toLocaleString('pt-BR')}.`,
            `Um giro de linhagem grátis (os seguintes custam ${GACHA.cost} ${GAME.premiumCurrency.plural}).`,
          ],
        },
        `Sem linhagem, nenhum atributo passa de ${NO_LINEAGE_CAP} e você não entra em partidas. Faça o giro logo.`,
      ],
    },
    {
      title: 'Retrato',
      blocks: ['No site, na aba Perfil, você pode enviar um retrato (PNG, JPEG ou WebP, até 1 MB). Sem retrato, o card usa uma silhueta na cor do seu token.'],
    },
  ],
  examples: [
    {
      title: 'A cor do token em campo',
      figure: (
        <FieldDiagram
          title="Tokens em campo"
          mode="2v2"
          crop={{ x0: 3, x1: 7, y0: 1, y1: 5 }}
          tokens={[
            { x: 4, y: 3, team: 'A', n: 10, ball: true },
            { x: 5, y: 2, team: 'A', n: 7 },
            { x: 6, y: 3, team: 'B', n: 4 },
            { x: 6, y: 4, team: 'B', n: 9 },
          ]}
        />
      ),
      text: 'O anel mostra o time. O miolo leva a cor que você escolheu e o número da camisa.',
    },
  ],
  faq: [
    { q: 'Posso mudar o nome depois?', a: 'Não pelo site. Fale com a administração do servidor.' },
    { q: 'A posição limita meus atributos?', a: 'Não. Quem define os tetos é a linhagem.' },
  ],
  related: ['primeiros-passos', 'atributos-e-tetos', 'giro-de-linhagem'],
};

const COMMANDS: [string, string][] = [
  ['/criar-personagem', 'Cria seu personagem.'],
  ['/perfil [usuario]', 'Sua ficha, ou a de outro jogador.'],
  ['/atributos', 'Distribui Pontos de Atributo.'],
  ['/loadout', 'Mostra o loadout de habilidades.'],
  ['/girar', 'Giro de linhagem.'],
  ['/treino drible | desarme | fisico | 1v1', `Treinos rápidos. Cada um custa ${ENERGY.trainingCost} de energia.`],
  ['/selecao', 'Modo Seleção: etapas contra times da instalação.'],
  ['/partida criar | sair', 'Abre um lobby casual ou ranqueado no canal, ou sai dele.'],
  ['/fila ranqueada | sair', 'Entra ou sai da fila ranqueada.'],
  ['/missoes', 'Missões diárias, semanais e de Despertar.'],
  ['/inventario', 'Equipamentos, cosméticos e materiais.'],
  ['/equipar', 'Equipa itens e cosméticos.'],
  ['/ranking [modo]', 'Ranking do servidor, Solo ou Time.'],
  ['/guia [tema]', 'Abre um destes guias no site.'],
  ['/site', 'Link do site com login.'],
];

export const comandos: GuideDoc = {
  slug: 'comandos-do-bot',
  summary: 'Tudo que acontece em partida passa pelo bot no Discord. Os comandos abrem painéis com botões: você quase não digita nada depois do primeiro comando.',
  sections: [
    {
      title: 'Comandos do jogador',
      blocks: [{ table: { head: ['Comando', 'O que faz'], rows: COMMANDS } }, 'Digite / no canal para ver a lista atualizada com as descrições.'],
    },
    {
      title: 'Bot e site',
      blocks: [
        'Os botões "Abrir no site" levam direto para a aba certa. Os endereços são fixos:',
        {
          table: {
            head: ['Página', 'Endereço'],
            rows: [
              ['Perfil', SITE_PATHS.perfil],
              ['Atributos', SITE_PATHS.atributos],
              ['Linhagem', SITE_PATHS.linhagem],
              ['Loadout', SITE_PATHS.loadout],
              ['Missões', SITE_PATHS.missoes],
              ['Giro', SITE_PATHS.giro],
              ['Ranking', `${SITE_PATHS.rankingSolo} e ${SITE_PATHS.rankingTime}`],
              ['Replay', SITE_PATHS.partida('<id>')],
              ['Guias', SITE_PATHS.guia('<tema>')],
            ],
          },
        },
      ],
    },
    {
      title: 'Administração',
      blocks: ['/admin é só para quem gerencia o servidor: dar moedas, apagar personagem, encerrar partida, ligar a depuração da IA na partida do canal e configurar o tempo do lance, o GIF e o orçamento de raridade de cada modo.'],
    },
  ],
  examples: [],
  faq: [
    { q: 'O bot não responde.', a: 'Existe um limite de comandos por usuário em poucos segundos. Espere um pouco e tente de novo ([[limites-diarios]]).' },
    { q: 'Posso comprar nó da árvore pelo bot?', a: 'Não. A compra é só no site, na aba Linhagem.' },
  ],
  related: ['primeiros-passos', 'estrutura-do-lance'],
};
