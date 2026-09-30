/**
 * Erro de regra do jogo. `message` é sempre texto para o jogador (pt-BR, curto,
 * sem jargão). Erros inesperados nunca chegam ao jogador com a mensagem original.
 */
export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export const isGameError = (e: unknown): e is GameError => e instanceof GameError;

export const ERR = {
  noCharacter: () => new GameError('no_character', 'Você ainda não tem personagem. Use /criar-personagem para começar.'),
  hasCharacter: () => new GameError('has_character', 'Você já tem um personagem. Veja com /perfil.'),
  noLineage: () => new GameError('no_lineage', 'Você ainda não tem linhagem. Faça seu giro gratuito com /girar.'),
  notEnough: (what: string) => new GameError('not_enough', `Você não tem ${what} suficiente.`),
  cooldown: (left: string) => new GameError('cooldown', `Ainda em recarga. Tente de novo em ${left}.`),
  invalid: (msg: string) => new GameError('invalid', msg),
};
