import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GACHA, PROGRESSION } from '@ego/content';
import { botSlot, buildSetup, createMatch, keeperSlot, resolveTurn } from '@ego/engine';
import {
  allocateAttribute,
  applyXp,
  attrUpgradeCost,
  buyNode,
  createCharacter,
  decideSpin,
  finalizeMatch,
  createMatchRecord,
  missionBoard,
  prisma,
  resetAttributes,
  rollRarity,
  setLoadout,
  slotFromCharacter,
  spendEnergy,
  spin,
  trackMetrics,
  upgradeItem,
  equipItem,
  effectiveAttrs,
} from '../src';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const PREFIX = `test-${Date.now()}-`;

async function newChar(n: number) {
  return createCharacter({ discordId: `${PREFIX}${n}`, guildId: 'g-test', discordName: 'tester', name: `Teste ${n}`, number: 9, position: 'atacante', foot: 'direito', tokenColor: '#1F6BFF' });
}

describe('regras puras', () => {
  it('XP por nível: 100 * nivel^1.35, 1 ponto de atributo por nível e 1 de linhagem a cada 2', () => {
    const r = applyXp(1, 0, 100 + Math.round(100 * Math.pow(2, 1.35)));
    expect(r.level).toBe(3);
    expect(r.attrPoints).toBe(2);
    expect(r.lineagePoints).toBe(1);
  });

  it('garantia de Lendária aos 60 giros e Mítica aos 200', () => {
    expect(rollRarity(0.0, GACHA.pityLegendary - 1, 0, 0.9).rarity).toBe('lendaria');
    expect(rollRarity(0.0, GACHA.pityLegendary - 1, 0, 0.9).forcedBy).toBe('lendaria');
    expect(rollRarity(0.0, 0, GACHA.pityMythic - 1, 0.9).rarity).toBe('mitica');
    expect(rollRarity(0.0, 10, 10, 0.9).rarity).toBe('comum');
    expect(rollRarity(0.999, 10, 10, 0.9).rarity).toBe('mitica');
  });

  it('chances somam 100%', () => {
    const total = Object.values(GACHA.rates).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

d('serviços com banco', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.character.deleteMany({ where: { discordId: { startsWith: PREFIX } } });
    await prisma.$disconnect();
  });

  it('cria personagem com giro grátis e valida entrada', async () => {
    const c = await newChar(1);
    expect(c.freeSpin).toBe(true);
    await expect(newChar(1)).rejects.toThrow(/já tem um personagem/);
    await expect(createCharacter({ discordId: `${PREFIX}x`, guildId: 'g', discordName: '', name: 'A', number: 100, position: 'atacante', foot: 'direito', tokenColor: '#000000' })).rejects.toThrow();
  });

  it('primeiro giro grátis equipa a linhagem; depois cobra coins e pede decisão', async () => {
    const c = await newChar(2);
    const r1 = await spin(c.id);
    expect(r1.free).toBe(true);
    expect(r1.autoAccepted).toBe(true);
    await expect(spin(c.id)).rejects.toThrow(/Blue Lock Coins/);
    await prisma.character.update({ where: { id: c.id }, data: { coins: GACHA.cost } });
    const r2 = await spin(c.id);
    expect(r2.autoAccepted).toBe(false);
    await expect(spin(c.id)).rejects.toThrow(/esperando decisão/);
    const dec = await decideSpin(c.id, r2.logId, true);
    expect(dec.accepted).toBe(true);
    const after = await prisma.character.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.lineageId).toBe(r2.lineageId);
    expect(after.coins).toBe(0);
    const logs = await prisma.gachaLog.findMany({ where: { characterId: c.id } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.seed.length === 32)).toBe(true);
  });

  it('atributos: até 6 só pontos; do 7 em diante pontos e fichas; teto da linhagem', async () => {
    const c = await newChar(3);
    await prisma.character.update({ where: { id: c.id }, data: { lineageId: 'isagi', attrPoints: 10, tokChute: 0 } });
    for (let i = 0; i < 3; i++) await allocateAttribute(c.id, 'chute');
    let cur = await prisma.character.findUniqueOrThrow({ where: { id: c.id } });
    expect(cur.chute).toBe(6);
    expect(attrUpgradeCost(cur, 'chute').tokens).toBe(15);
    await expect(allocateAttribute(c.id, 'chute')).rejects.toThrow(/fichas/);
    await prisma.character.update({ where: { id: c.id }, data: { tokChute: 15 } });
    await allocateAttribute(c.id, 'chute');
    cur = await prisma.character.findUniqueOrThrow({ where: { id: c.id } });
    expect(cur.chute).toBe(7);
    expect(cur.tokChute).toBe(0);
    // Isagi: Defesa com teto 6
    await prisma.character.update({ where: { id: c.id }, data: { defesa: 6, attrPoints: 5 } });
    await expect(allocateAttribute(c.id, 'defesa')).rejects.toThrow(/teto/);
  });

  it('reset de atributos devolve pontos e fichas, custa Ienes e tem recarga', async () => {
    const c = await newChar(4);
    await prisma.character.update({ where: { id: c.id }, data: { lineageId: 'kuon', chute: 7, attrPoints: 0, ienes: PROGRESSION.reset.attributesCost } });
    const r = await resetAttributes(c.id);
    expect(r.chute).toBe(3);
    expect(r.attrPoints).toBe(4);
    expect(r.tokChute).toBe(15);
    expect(r.ienes).toBe(0);
    await prisma.character.update({ where: { id: c.id }, data: { ienes: 99999 } });
    await expect(resetAttributes(c.id)).rejects.toThrow(/recarga/);
  });

  it('árvore: exige nó anterior, pontos e despertar; loadout valida', async () => {
    const c = await newChar(5);
    await prisma.character.update({ where: { id: c.id }, data: { lineageId: 'isagi', lineagePoints: 10 } });
    await expect(buyNode(c.id, 'isagi_metavisao')).rejects.toThrow(/anterior/);
    await buyNode(c.id, 'isagi_leitura');
    await buyNode(c.id, 'isagi_metavisao');
    await buyNode(c.id, 'isagi_chute_direto');
    await expect(buyNode(c.id, 'isagi_peca')).rejects.toThrow(/Despertar/);
    // completa a missão de despertar
    await prisma.$transaction((tx) => trackMetrics(tx, c.id, { gol_de_primeira: 15 }, 'isagi'));
    await buyNode(c.id, 'isagi_peca');
    await setLoadout(c.id, ['metavisao', 'chute_direto', 'leitura_espacial'], 'peca_que_encaixa');
    await expect(setLoadout(c.id, ['devorar'], 'ego_desperto')).rejects.toThrow(/desbloqueada/);
    const after = await prisma.character.findUniqueOrThrow({ where: { id: c.id } });
    // a recompensa do Despertar dá XP: níveis ganhos também dão Pontos de Linhagem
    expect(after.lineagePoints).toBe(10 - 1 - 2 - 1 - 3 + Math.floor(after.level / 2));
  });

  it('missões: 3 diárias, 3 semanais e bônus de coins ao completar as 3 diárias', async () => {
    const c = await newChar(6);
    const board = await missionBoard(c.id);
    expect(board.daily).toHaveLength(3);
    expect(board.weekly).toHaveLength(3);
    const metrics: Record<string, number> = {};
    for (const m of board.daily) metrics[(await import('@ego/content')).getMission(m.id).metric] = 999;
    const upd = await prisma.$transaction((tx) => trackMetrics(tx, c.id, metrics, null));
    expect(upd.bonus.some((b) => b.kind === 'daily' && b.coins === 5)).toBe(true);
    const after = await prisma.character.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.coins).toBeGreaterThanOrEqual(5);
  });

  it('energia de treino: 6 por dia', async () => {
    const c = await newChar(7);
    for (let i = 0; i < 6; i++) await spendEnergy(c.id);
    await expect(spendEnergy(c.id)).rejects.toThrow(/esgotada/);
    // quem está em INFINITE_ENERGY_IDS não gasta
    const before = process.env.INFINITE_ENERGY_IDS;
    process.env.INFINITE_ENERGY_IDS = `outro, ${c.discordId}`;
    try {
      for (let i = 0; i < 10; i++) expect((await spendEnergy(c.id)).energy).toBe(6);
    } finally {
      process.env.INFINITE_ENERGY_IDS = before;
    }
  });

  it('equipamento: +1 acima do teto no máximo; melhoria custa Ienes', async () => {
    const c = await newChar(8);
    await prisma.character.update({ where: { id: c.id }, data: { lineageId: 'kuon', velocidade: 7, ienes: 5000 } });
    const it = await prisma.inventoryItem.create({ data: { characterId: c.id, itemId: 'chuteira_trava_rapida' } });
    await equipItem(c.id, it.id);
    await upgradeItem(c.id, it.id);
    await upgradeItem(c.id, it.id);
    const cur = await prisma.character.findUniqueOrThrow({ where: { id: c.id } });
    const items = await prisma.inventoryItem.findMany({ where: { characterId: c.id } });
    // Kuon: teto 7; +3 da chuteira +2, mas passa do teto só em +1
    expect(effectiveAttrs(cur, items).velocidade).toBe(8);
    await expect(upgradeItem(c.id, it.id)).rejects.toThrow(/máximo/);
  });

  it('fecha partida: recompensas, maestria, retorno decrescente e MMR', async () => {
    const a = await newChar(9);
    const b = await newChar(10);
    for (const c of [a, b]) await prisma.character.update({ where: { id: c.id }, data: { lineageId: 'kuon' } });
    const [ca, cb] = await Promise.all([prisma.character.findUniqueOrThrow({ where: { id: a.id } }), prisma.character.findUniqueOrThrow({ where: { id: b.id } })]);
    const slots = [
      await slotFromCharacter(ca, { id: 'A1', team: 'A' }),
      keeperSlot('AGK', 'A', 1),
      await slotFromCharacter(cb, { id: 'B1', team: 'B' }),
      keeperSlot('BGK', 'B', 1),
    ];
    const setup = buildSetup({ id: `${PREFIX}m1`, seed: 's', mode: '1v1', kind: 'ranqueada', slots, turnsPerHalf: 1, halves: 1 });
    await createMatchRecord({ guildId: 'g-test', mode: '1v1', kind: 'ranqueada', setup });
    let s = createMatch(setup);
    const plans = { A1: { playerId: 'A1', dest: s.players.A1.pos, action: 'proteger' as const } };
    const r = resolveTurn(s, plans);
    s = r.state;
    expect(s.finished).toBe(true);
    const res = await finalizeMatch(setup.id, s, [r.plans]);
    // B1 não agiu: o lado B não teve ação própria -> não conta MMR e fica sinalizado
    expect(res.flagged).toBe(true);
    expect(res.countsForMmr).toBe(false);
    const pb = res.participants.find((p) => p.slotId === 'B1')!;
    expect(pb.multiplier).toBeLessThanOrEqual(0.2);
    const pa = res.participants.find((p) => p.slotId === 'A1')!;
    expect(pa.reward?.xp ?? 0).toBeGreaterThan(0);
    await expect(finalizeMatch(setup.id, s, [r.plans])).rejects.toThrow(/encerrada/);
    void botSlot;
  });
});
