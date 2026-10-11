/**
 * Gera a arte original do projeto em assets/:
 *  - brand/: logo (SVG + PNG)
 *  - frames/: molduras por raridade + Grade da Instalação
 *  - cosmetics/: placa do título Egoísta, rastro Faísca Azul
 *  - tokens/: base de token (times, raridades, goleiro, bola)
 *  - samples/: amostras do campo, painel, GIF, card, resultado, treinos, etapas e giro
 *  - placeholders/: prévia dos placeholders de habilidade e linhagem. Eles NÃO ficam em
 *    assets/skills e assets/lineages, que são reservadas para a arte final.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { COLORS, LINEAGES, RARITIES, SELECTION_GROUPS } from '@ego/content';
import {
  autoTurn,
  botSlot,
  buildSetup,
  createMatch,
  keeperSlot,
  newDuelTraining,
  newPhysicalTraining,
  normalizePlans,
  planBots,
  playDuelTraining,
  playPhysical,
  publicRevelation,
  reachableCells,
  type MatchState,
  type SlotSetup,
} from '@ego/engine';
import {
  arrowsFromResult,
  arrowsFromRevelation,
  assetsDir,
  ensureFonts,
  frameSvg,
  lineagePortraitSvg,
  logoSvg,
  overlaysFromResult,
  renderDuelTraining,
  renderField,
  renderGachaGif,
  renderGachaResult,
  renderPhysical,
  renderPlanView,
  renderProfileCard,
  renderResultCard,
  renderStage,
  renderStepsGif,
  skillIconSvg,
  sparkTrailSvg,
  titlePlateSvg,
  tokenSvg,
} from '../src';

ensureFonts();
const root = assetsDir();
const dir = (p: string) => {
  const d = join(root, p);
  mkdirSync(d, { recursive: true });
  return d;
};

async function svgToPng(svg: string, w: number, h: number): Promise<Buffer> {
  const img = await loadImage(Buffer.from(svg));
  const c = createCanvas(w, h);
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toBuffer('image/png');
}

async function both(folder: string, name: string, svg: string, w: number, h: number) {
  const d = dir(folder);
  writeFileSync(join(d, `${name}.svg`), svg);
  writeFileSync(join(d, `${name}.png`), await svgToPng(svg, w, h));
}

await both('brand', 'logo', logoSvg({ height: 128 }), 562, 128);
await both('brand', 'logo-mark', logoSvg({ height: 256, withWordmark: false }), 256, 256);
for (const r of RARITIES) await both('frames', `moldura_${r}`, frameSvg(`moldura_${r}`, 400, 560), 400, 560);
await both('frames', 'moldura_grade', frameSvg('moldura_grade', 400, 560), 400, 560);
await both('cosmetics', 'titulo_egoista', titlePlateSvg('Egoísta', 260, 46), 260, 46);
await both('cosmetics', 'rastro_faisca_azul', sparkTrailSvg(240, 60), 240, 60);
await both('tokens', 'token-time-a', tokenSvg({ color: COLORS.teamA, number: 10, size: 96 }), 96, 96);
await both('tokens', 'token-time-b', tokenSvg({ color: COLORS.teamB, number: 7, size: 96 }), 96, 96);
await both('tokens', 'token-goleiro', tokenSvg({ color: COLORS.teamA, number: 1, keeper: true, size: 96 }), 96, 96);
await both('tokens', 'token-posse', tokenSvg({ color: COLORS.teamA, number: 9, ball: true, size: 96 }), 96, 96);
for (const r of RARITIES) await both('tokens', `anel-${r}`, tokenSvg({ color: COLORS.panel, rarity: r, size: 96 }), 96, 96);
for (const l of LINEAGES) {
  await both('placeholders/lineages', l.id, lineagePortraitSvg(l.id, 256), 256, 256);
  for (const sk of l.skills) await both(`placeholders/skills/${l.id}`, sk.id, skillIconSvg(sk.id, 128), 128, 128);
}

// amostras procedurais
const samples = dir('samples');
const lin = ['isagi', 'chigiri', 'lavinho', 'gagamaru', 'kuon', 'kuon'];
const slots: SlotSetup[] = [];
for (const t of ['A', 'B'] as const) {
  for (let i = 0; i < 3; i++)
    slots.push(botSlot({ name: `${t === 'A' ? 'Azul' : 'Branco'} ${i + 1}`, lineageId: lin[i + (t === 'B' ? 3 : 0)], level: 20, personality: 'coletivo', position: 'atacante' }, `${t}${i + 1}`, t, 'elite'));
  slots.push(keeperSlot(`${t}GK`, t, 20));
}
slots[0].trailId = 'rastro_faisca_azul';
const botIds = slots.map((x) => x.id);
let s: MatchState = createMatch(buildSetup({ id: 'amostra', seed: 'amostra', mode: '3v3', kind: 'simulacao', slots }));
for (let i = 0; i < 4; i++) s = autoTurn(s, { botIds }).result.state;
const plans = normalizePlans(s, planBots(s, botIds).plans);
writeFileSync(join(samples, 'campo.png'), renderField(s, { showZones: true }));
writeFileSync(join(samples, 'revelacao.png'), renderField(s, { arrows: arrowsFromRevelation(s, publicRevelation(s, plans)), hudRight: 'REVELAÇÃO' }));
const holder = s.ball.holder ?? 'A1';
writeFileSync(join(samples, 'planejamento.png'), renderPlanView(s, holder, { reach: reachableCells(s, holder) }));
const r = autoTurn(s, { botIds }).result;
writeFileSync(join(samples, 'resolucao.png'), renderField(r.state, { arrows: arrowsFromResult(s, r), overlays: overlaysFromResult(s, r), hudRight: 'RESOLUÇÃO' }));
writeFileSync(join(samples, 'passos.gif'), renderStepsGif(s, r));
writeFileSync(
  join(samples, 'card-perfil.png'),
  await renderProfileCard({
    name: 'Candidato 001',
    number: 9,
    position: 'atacante',
    tokenColor: '#1F6BFF',
    level: 12,
    xp: 400,
    xpNeeded: 2860,
    lineage: { id: 'chigiri', name: 'Chigiri', rarity: 'epica' },
    rank: { solo: 47, time: null, mmrSolo: 1090, mmrTime: 1000 },
    attrs: { velocidade: 9, drible: 6, passe: 5, chute: 7, fisico: 4, visao: 5, defesa: 3 },
    caps: { velocidade: 10, drible: 7, passe: 6, chute: 8, fisico: 4, visao: 6, defesa: 4 },
    titleId: 'titulo_egoista',
    frameId: null,
    marketValue: 1_850_000,
    stats: { goals: 14, assists: 5, matches: 22, wins: 12 },
    serial: '0001',
  }),
);
writeFileSync(
  join(samples, 'card-resultado.png'),
  await renderResultCard({
    score: r.state.score,
    winner: r.state.score.A > r.state.score.B ? 'A' : r.state.score.B > r.state.score.A ? 'B' : 'draw',
    mode: '3v3',
    kindLabel: 'Casual',
    teamColors: { A: COLORS.teamA, B: COLORS.teamB },
    serial: 'AMOSTRA',
    players: slots.map((x) => {
      const p = r.state.players[x.id];
      return {
        name: x.name,
        number: x.number,
        team: x.team,
        lineageId: x.lineageId,
        rarity: LINEAGES.find((l) => l.id === x.lineageId)!.rarity,
        goals: p.stats.goals,
        assists: p.stats.assists,
        ego: p.ego,
        chem: p.chem,
        dribbles: p.stats.dribblesWon,
        reads: p.stats.readsCorrect,
        saves: p.stats.saves,
        isKeeper: x.isKeeper,
        isBot: true,
      };
    }),
  }),
);
let dt = newDuelTraining('drible', 'amostra', slots[0].attrs, 12);
writeFileSync(join(samples, 'treino-drible-inicio.png'), renderDuelTraining(dt));
dt = playDuelTraining(dt, 'driblar');
writeFileSync(join(samples, 'treino-drible.png'), renderDuelTraining(dt));
let de = newDuelTraining('desarme', 'amostra', slots[0].attrs, 12);
de = playDuelTraining(de, 'conter');
writeFileSync(join(samples, 'treino-desarme.png'), renderDuelTraining(de));
let ph = newPhysicalTraining('amostra', slots[0].attrs);
ph = playPhysical(ph, 0, 'sprint');
writeFileSync(join(samples, 'treino-fisico.png'), renderPhysical(ph));
for (const g of SELECTION_GROUPS)
  for (const st of g.stages) writeFileSync(join(samples, `selecao-${st.id}.png`), await renderStage(st, g.name, { cleared: false, unlocked: true, wins: 0 }));
for (const rar of RARITIES) {
  const l = LINEAGES.find((x) => x.rarity === rar);
  if (l) writeFileSync(join(samples, `giro-${rar}.png`), await renderGachaResult(rar, l.id, 'amostra'));
}
writeFileSync(join(samples, 'giro.gif'), await renderGachaGif('lendaria', 'isagi', 'amostra'));
console.log(`Arte gerada em ${root}`);
