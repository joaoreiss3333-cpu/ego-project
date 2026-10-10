import { ATTR_LABEL, GAME, RARITY_LABEL, SELECTION_GROUPS, type AttrKey, type CosmeticDef, type CosmeticType } from '@ego/content';
import { fmt } from './format';

export const COSMETIC_TYPE_LABEL: Record<CosmeticType, { title: string; one: string; hint: string }> = {
  moldura: { title: 'Molduras', one: 'Moldura', hint: 'Contorno do card e do token em campo.' },
  titulo: { title: 'Títulos', one: 'Título', hint: 'Placa exibida no perfil e no lobby.' },
  rastro: { title: 'Rastros', one: 'Rastro', hint: 'Efeito na linha do chute, na imagem do campo e no GIF.' },
};

/** Condição de liberação escrita a partir da regra (não do texto livre). */
export function unlockText(def: CosmeticDef): string {
  const u = def.unlock;
  switch (u.kind) {
    case 'default':
      return u.rarity ? `Liberada para quem já obteve uma linhagem ${RARITY_LABEL[u.rarity]}.` : 'Padrão para todos.';
    case 'selection': {
      const g = SELECTION_GROUPS.find((x) => x.id === u.groupId);
      return `Concluir todas as etapas da ${g?.name ?? u.groupId} no Modo Seleção.`;
    }
    case 'stat':
      return `Marcar ${u.value} gols em partidas.`;
    case 'craft': {
      const toks = Object.entries(u.tokens)
        .map(([k, v]) => `${v} fichas de ${ATTR_LABEL[k as AttrKey]}`)
        .join(' e ');
      return `Criar com ${toks} e ${fmt(u.ienes)} ${GAME.commonCurrency.plural}.`;
    }
  }
}
