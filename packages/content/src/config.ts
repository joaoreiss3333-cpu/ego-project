/**
 * Identidade do projeto. Troque aqui e tudo (bot, site, imagens, guias) acompanha.
 */
export const GAME = {
  name: 'EGO PROJECT',
  shortName: 'EGO',
  tagline: 'Instalação de avaliação de atacantes',
  premiumCurrency: {
    id: 'coins',
    name: 'Blue Lock Coin',
    plural: 'Blue Lock Coins',
    short: 'BLC',
  },
  commonCurrency: {
    id: 'ienes',
    name: 'Iene',
    plural: 'Ienes',
    short: '¥',
  },
} as const;

/** Paleta fixa usada pelo bot (cor dos containers), pelas imagens e pelo site. */
export const COLORS = {
  background: '#070B12',
  panel: '#0D1420',
  line: '#1B2940',
  electric: '#1F6BFF',
  electricBright: '#4C8DFF',
  white: '#FFFFFF',
  muted: '#7F8CA3',
  alert: '#FF2E3A',
  amber: '#FFB020',
  success: '#2BD67B',
  teamA: '#1F6BFF',
  teamB: '#F2F4F8',
} as const;

export const RARITY_COLORS = {
  comum: '#8A96A8',
  rara: '#2BB3FF',
  epica: '#B45CFF',
  lendaria: '#FFB020',
  mitica: '#FF2E3A',
} as const;

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
