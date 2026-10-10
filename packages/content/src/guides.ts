/**
 * Índice dos guias e caminhos do site. O bot usa isto para montar links
 * (/guia, botões "Abrir no site"); o site usa para rotas e menu lateral.
 */

export interface GuideEntry {
  slug: string;
  title: string;
  category: GuideCategory;
  /** Palavras extras para a busca. */
  keywords: string[];
}

export type GuideCategory = 'comecando' | 'partida' | 'personagem' | 'grind' | 'itens' | 'giro' | 'ranking';

export const GUIDE_CATEGORIES: { id: GuideCategory; title: string }[] = [
  { id: 'comecando', title: 'Começando' },
  { id: 'partida', title: 'A partida' },
  { id: 'personagem', title: 'Personagem' },
  { id: 'grind', title: 'Grind' },
  { id: 'itens', title: 'Itens' },
  { id: 'giro', title: 'Giro de linhagem' },
  { id: 'ranking', title: 'Ranking' },
];

export const GUIDES: GuideEntry[] = [
  { slug: 'primeiros-passos', title: 'Primeiros passos', category: 'comecando', keywords: ['inicio', 'comecar', 'novo'] },
  { slug: 'criacao-de-personagem', title: 'Criação de personagem', category: 'comecando', keywords: ['criar', 'personagem', 'camisa', 'posicao'] },
  { slug: 'comandos-do-bot', title: 'Comandos do bot', category: 'comecando', keywords: ['comandos', 'slash', 'discord'] },

  { slug: 'estrutura-do-lance', title: 'Estrutura do lance', category: 'partida', keywords: ['planejamento', 'revelacao', 'resolucao', 'passos', 'turno'] },
  { slug: 'movimento-e-iniciativa', title: 'Movimento e iniciativa', category: 'partida', keywords: ['mover', 'casas', 'sprint', 'velocidade'] },
  { slug: 'zona-de-controle', title: 'Zona de controle', category: 'partida', keywords: ['zona', 'contato', 'vizinhas'] },
  { slug: 'duelos', title: 'Duelos e a matriz', category: 'partida', keywords: ['duelo', 'matriz', 'bote', 'conter', 'driblar', 'proteger'] },
  { slug: 'passe', title: 'Passe no pé e no espaço', category: 'partida', keywords: ['passe', 'interceptacao', 'tabela'] },
  { slug: 'acoes-sem-bola-ataque', title: 'Ações sem bola no ataque', category: 'partida', keywords: ['desmarque', 'abrir linha', 'corta-luz', 'pedir a bola', 'tabela'] },
  { slug: 'acoes-sem-bola-defesa', title: 'Ações sem bola na defesa', category: 'partida', keywords: ['bote', 'conter', 'fechar linha', 'marcar'] },
  { slug: 'leitura', title: 'Leitura', category: 'partida', keywords: ['leitura', 'adivinhar', 'prever'] },
  { slug: 'chute-e-goleiro', title: 'Chute e goleiro', category: 'partida', keywords: ['chute', 'gol', 'goleiro', 'zonas'] },
  { slug: 'folego', title: 'Fôlego', category: 'partida', keywords: ['folego', 'stamina', 'cansaco'] },
  { slug: 'flow', title: 'Flow', category: 'partida', keywords: ['flow', 'especial'] },
  { slug: 'ego-e-quimica', title: 'Ego e Química', category: 'partida', keywords: ['ego', 'quimica'] },
  { slug: 'modos-e-campos', title: 'Modos e tamanhos de campo', category: 'partida', keywords: ['1v1', '2v2', '3v3', '4v4', '5v5', 'campo'] },
  { slug: 'orcamento-de-raridade', title: 'Orçamento de raridade', category: 'partida', keywords: ['ranqueada', 'orcamento', 'raridade'] },

  { slug: 'atributos-e-tetos', title: 'Atributos e tetos', category: 'personagem', keywords: ['atributos', 'teto', 'velocidade', 'drible'] },
  { slug: 'niveis-e-pontos', title: 'Níveis e pontos', category: 'personagem', keywords: ['nivel', 'xp', 'pontos'] },
  { slug: 'fichas-de-treino', title: 'Fichas de Treino', category: 'personagem', keywords: ['fichas', 'tokens'] },
  { slug: 'linhagens', title: 'Linhagens e raridades', category: 'personagem', keywords: ['linhagem', 'raridade', 'kuon', 'gagamaru', 'chigiri', 'isagi', 'lavinho'] },
  { slug: 'arvore-e-despertares', title: 'Árvore e Despertares', category: 'personagem', keywords: ['arvore', 'nos', 'despertar'] },
  { slug: 'loadout', title: 'Loadout', category: 'personagem', keywords: ['loadout', 'build', 'habilidades'] },
  { slug: 'maestria', title: 'Maestria', category: 'personagem', keywords: ['maestria', 'usos'] },

  { slug: 'treinos', title: 'Treinos', category: 'grind', keywords: ['treino', 'energia', 'drible', 'desarme', 'fisico'] },
  { slug: 'modo-selecao', title: 'Modo Seleção', category: 'grind', keywords: ['pve', 'selecao', 'chefe'] },
  { slug: 'missoes', title: 'Missões', category: 'grind', keywords: ['missoes', 'diarias', 'semanais'] },
  { slug: 'recompensas-de-partida', title: 'Recompensas de partida', category: 'grind', keywords: ['recompensa', 'xp', 'ienes'] },
  { slug: 'limites-diarios', title: 'Limites diários', category: 'grind', keywords: ['limite', 'retorno decrescente', 'abuso'] },

  { slug: 'equipamentos', title: 'Equipamentos', category: 'itens', keywords: ['chuteira', 'caneleira', 'melhorar'] },
  { slug: 'cosmeticos', title: 'Cosméticos', category: 'itens', keywords: ['moldura', 'titulo', 'rastro'] },

  { slug: 'giro-de-linhagem', title: 'Giro de linhagem', category: 'giro', keywords: ['giro', 'gacha', 'chances', 'garantia'] },

  { slug: 'ranking-e-temporadas', title: 'Ranking e temporadas', category: 'ranking', keywords: ['ranking', 'mmr', 'temporada'] },
];

export function findGuide(slug: string): GuideEntry | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Caminhos do site (a aba e a subaba ficam na URL). */
export const SITE_PATHS = {
  perfil: '/perfil',
  atributos: '/personagem/atributos',
  linhagem: '/personagem/linhagem',
  loadout: '/personagem/loadout',
  equipamentos: '/inventario/equipamentos',
  cosmeticos: '/inventario/cosmeticos',
  materiais: '/inventario/materiais',
  missoes: '/progresso/missoes',
  despertares: '/progresso/despertares',
  maestria: '/progresso/maestria',
  selecao: '/progresso/selecao',
  giro: '/giro',
  rankingSolo: '/ranking/solo',
  rankingTime: '/ranking/time',
  partidas: '/partidas',
  partida: (id: string) => `/partidas/${id}`,
  guias: '/guias',
  guia: (slug: string) => `/guias/${slug}`,
  login: '/entrar',
} as const;
