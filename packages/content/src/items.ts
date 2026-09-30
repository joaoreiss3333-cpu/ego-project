import type { CosmeticDef, EquipmentDef, Rarity } from './types';
import { RARITY_COLORS } from './config';
import { RARITY_LABEL } from './rules';

export const EQUIPMENT: EquipmentDef[] = [
  {
    id: 'chuteira_trava_rapida',
    name: 'Chuteira Trava Rápida',
    slot: 'chuteira',
    attr: 'velocidade',
    bonusByLevel: [1, 2, 3],
    upgradeCost: [600, 1500],
    source: 'Drop das partidas do Modo Seleção',
    description: 'Trava curta, saída rápida. Soma em Velocidade.',
  },
  {
    id: 'caneleira_reforcada',
    name: 'Caneleira Reforçada',
    slot: 'caneleira',
    attr: 'defesa',
    bonusByLevel: [1, 2, 3],
    upgradeCost: [600, 1500],
    source: 'Drop dos chefes do Modo Seleção',
    description: 'Placa dupla. Soma em Defesa.',
  },
];

export function getEquipment(id: string): EquipmentDef {
  const e = EQUIPMENT.find((x) => x.id === id);
  if (!e) throw new Error(`Equipamento desconhecido: ${id}`);
  return e;
}

const rarityFrames: CosmeticDef[] = (Object.keys(RARITY_COLORS) as Rarity[]).map((r) => ({
  id: `moldura_${r}`,
  name: `Moldura ${RARITY_LABEL[r]}`,
  type: 'moldura' as const,
  description: `Moldura padrão da raridade ${RARITY_LABEL[r]}. Disponível para quem tem uma linhagem ${RARITY_LABEL[r]} equipada.`,
  unlock: { kind: 'default' as const, rarity: r },
  color: RARITY_COLORS[r],
}));

export const COSMETICS: CosmeticDef[] = [
  ...rarityFrames,
  {
    id: 'moldura_grade',
    name: 'Grade da Instalação',
    type: 'moldura',
    description: 'Moldura do token e do card de perfil. Para quem sobreviveu à Primeira Seleção.',
    unlock: { kind: 'selection', groupId: 'primeira' },
    color: '#1F6BFF',
  },
  {
    id: 'titulo_egoista',
    name: 'Egoísta',
    type: 'titulo',
    description: 'Título exibido no perfil e no lobby.',
    unlock: { kind: 'stat', stat: 'gols', value: 10 },
    color: '#FFFFFF',
  },
  {
    id: 'rastro_faisca_azul',
    name: 'Faísca Azul',
    type: 'rastro',
    description: 'Efeito na linha do chute, na imagem do campo e no GIF.',
    unlock: { kind: 'craft', tokens: { chute: 30 }, ienes: 800 },
    color: '#4C8DFF',
  },
];

export function getCosmetic(id: string): CosmeticDef {
  const c = COSMETICS.find((x) => x.id === id);
  if (!c) throw new Error(`Cosmético desconhecido: ${id}`);
  return c;
}

export function findCosmetic(id: string | null | undefined): CosmeticDef | undefined {
  return id ? COSMETICS.find((x) => x.id === id) : undefined;
}
