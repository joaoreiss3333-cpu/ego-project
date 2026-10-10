/**
 * Simulação em massa entre bots.
 * Uso: pnpm simulate -- --matches 1000 --level 20 --difficulty elite
 * Gera reports/simulation.json e reports/simulation.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINEAGES, RARITY_LABEL, allSkills, getLineage, getSkill, unlockedSkills, type Difficulty, type MatchMode, type Personality, type Position } from '@ego/content';
import { botNodes, botSlot, keeperSlot } from '../src/bots';
import { autoTurn } from '../src/runner';
import { buildSetup, createMatch } from '../src/setup';
import { Rng } from '../src/rng';
import type { MatchState, SlotSetup, Team } from '../src/types';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const N = Number(arg('matches', '1000'));
const LEVEL = Number(arg('level', '20'));
const DIFF = arg('difficulty', 'elite') as Difficulty;
const SEED = arg('seed', 'balance-v1');

const rng = new Rng(SEED);
const personalities: Personality[] = ['egoista', 'coletivo', 'agressivo', 'cauteloso'];
const positions: Position[] = ['atacante', 'meio', 'defensor'];

interface LineageStat {
  appearances: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  duelsWon: number;
  duelsLost: number;
}

const byLineage: Record<string, LineageStat> = {};
const byRarity: Record<string, { w: number; d: number; l: number; n: number }> = {};
const skillUses: Record<string, number> = {};
const skillAvailable: Record<string, number> = {};
const flowUses: Record<string, number> = {};
let totalGoals = 0;
let totalTurns = 0;
let decisionMax = 0;
let decisionSum = 0;
let decisionN = 0;
const scoreDist: Record<string, number> = {};
const modeCount: Record<string, number> = {};
const t0 = Date.now();

function pickMode(): MatchMode {
  const r = rng.next();
  return r < 0.55 ? '1v1' : r < 0.8 ? '2v2' : '3v3';
}

function makeTeam(team: Team, n: number): SlotSetup[] {
  const out: SlotSetup[] = [];
  for (let i = 0; i < n; i++) {
    const l = rng.pick(LINEAGES);
    const slot =
      botSlot(
        { name: `${l.name} ${team}${i + 1}`, lineageId: l.id, level: LEVEL, nodes: botNodes(l.id, LEVEL + 10, true), personality: rng.pick(personalities), position: n === 1 ? 'atacante' : rng.pick(positions) },
        `${team}${i + 1}`,
        team,
        DIFF,
      );
    // loadout sorteado entre as ativas desbloqueadas: cobre todas as habilidades no relatório
    const actives = unlockedSkills(l.id, slot.nodes).filter((id) => getSkill(id).kind === 'active');
    const pool = [...actives];
    const chosen: string[] = [];
    while (chosen.length < 3 && pool.length) chosen.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
    const flows = unlockedSkills(l.id, slot.nodes).filter((id) => getSkill(id).kind === 'flow');
    slot.loadout = { active: chosen, flow: flows[Math.floor(rng.next() * flows.length)] };
    out.push(slot);
  }
  out.push(keeperSlot(`${team}GK`, team, LEVEL, DIFF));
  return out;
}

for (let m = 0; m < N; m++) {
  const mode = pickMode();
  modeCount[mode] = (modeCount[mode] ?? 0) + 1;
  const n = Number(mode[0]);
  const slots = [...makeTeam('A', n), ...makeTeam('B', n)];
  const setup = buildSetup({ id: `sim${m}`, seed: `${SEED}:${m}`, mode, kind: 'simulacao', slots });
  let s: MatchState = createMatch(setup);
  const botIds = slots.map((x) => x.id);
  let guard = 0;
  while (!s.finished && guard++ < 100) {
    const out = autoTurn(s, { botIds });
    for (const d of out.debug) for (const b of d.bots) {
      decisionMax = Math.max(decisionMax, b.ms);
      decisionSum += b.ms;
      decisionN++;
    }
    s = out.result.state;
  }
  totalTurns += s.turn - 1;
  totalGoals += s.score.A + s.score.B;
  const key = `${Math.max(s.score.A, s.score.B)}x${Math.min(s.score.A, s.score.B)}`;
  scoreDist[key] = (scoreDist[key] ?? 0) + 1;

  for (const slot of slots) {
    if (slot.isKeeper) continue;
    const p = s.players[slot.id];
    const st = (byLineage[slot.lineageId] ??= { appearances: 0, wins: 0, draws: 0, losses: 0, goals: 0, duelsWon: 0, duelsLost: 0 });
    st.appearances++;
    st.goals += p.stats.goals;
    st.duelsWon += p.stats.duelsWon;
    st.duelsLost += p.stats.duelsLost;
    if (s.winner === 'draw') st.draws++;
    else if (s.winner === slot.team) st.wins++;
    else st.losses++;
    for (const sid of [...slot.loadout.active, slot.loadout.flow ?? '']) if (sid) skillAvailable[sid] = (skillAvailable[sid] ?? 0) + 1;
    for (const [sid, c] of Object.entries(p.stats.skillUses)) skillUses[sid] = (skillUses[sid] ?? 0) + c;
    if (p.stats.flowActivations) flowUses[slot.loadout.flow ?? '?'] = (flowUses[slot.loadout.flow ?? '?'] ?? 0) + p.stats.flowActivations;
  }
  // raridade: só 1v1 compara linhagem contra linhagem diretamente
  if (mode === '1v1') {
    for (const team of ['A', 'B'] as Team[]) {
      const slot = slots.find((x) => x.team === team && !x.isKeeper)!;
      const r = getLineage(slot.lineageId).rarity;
      const st = (byRarity[r] ??= { w: 0, d: 0, l: 0, n: 0 });
      st.n++;
      if (s.winner === 'draw') st.d++;
      else if (s.winner === team) st.w++;
      else st.l++;
    }
  }
  if ((m + 1) % 50 === 0) process.stdout.write(`\r${m + 1}/${N} partidas`);
}
process.stdout.write('\n');

const elapsed = (Date.now() - t0) / 1000;
const report = {
  config: { matches: N, level: LEVEL, difficulty: DIFF, seed: SEED, modes: modeCount },
  summary: {
    goalsPerMatch: +(totalGoals / N).toFixed(2),
    turnsPerMatch: +(totalTurns / N).toFixed(2),
    decisionAvgMs: +(decisionSum / Math.max(1, decisionN)).toFixed(2),
    decisionMaxMs: decisionMax,
    elapsedSeconds: +elapsed.toFixed(1),
  },
  scoreDistribution: scoreDist,
  winRateByRarity1v1: Object.fromEntries(
    Object.entries(byRarity).map(([r, v]) => [RARITY_LABEL[r as keyof typeof RARITY_LABEL], { partidas: v.n, vitoria: +(v.w / v.n).toFixed(3), empate: +(v.d / v.n).toFixed(3), derrota: +(v.l / v.n).toFixed(3) }]),
  ),
  byLineage: Object.fromEntries(
    Object.entries(byLineage).map(([id, v]) => [
      id,
      {
        aparicoes: v.appearances,
        vitoria: +(v.wins / v.appearances).toFixed(3),
        golsPorPartida: +(v.goals / v.appearances).toFixed(2),
        duelosVencidos: +(v.duelsWon / Math.max(1, v.duelsWon + v.duelsLost)).toFixed(3),
      },
    ]),
  ),
  skills: Object.fromEntries(
    allSkills().map((sk) => [
      sk.id,
      {
        nome: sk.name,
        linhagem: sk.lineageId,
        tipo: sk.kind,
        equipadaEm: skillAvailable[sk.id] ?? 0,
        usosComSucesso: skillUses[sk.id] ?? 0,
        usosPorPartidaEquipada: +((skillUses[sk.id] ?? 0) / Math.max(1, skillAvailable[sk.id] ?? 0)).toFixed(2),
        ativacoesDeFlow: flowUses[sk.id] ?? 0,
      },
    ]),
  ),
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', '..', 'reports');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'simulation.json'), JSON.stringify(report, null, 2));

const md: string[] = [];
md.push(`# Relatório de simulação`, '', `${N} partidas, nível ${LEVEL}, dificuldade ${DIFF}, seed \`${SEED}\`.`, '');
md.push(`- Gols por partida: **${report.summary.goalsPerMatch}**`);
md.push(`- Lances por partida: **${report.summary.turnsPerMatch}**`);
md.push(`- Decisão da IA: média ${report.summary.decisionAvgMs} ms, máximo ${report.summary.decisionMaxMs} ms`);
md.push(`- Tempo total: ${report.summary.elapsedSeconds}s`, '');
md.push('## Vitória por raridade (1v1)', '', '| Raridade | Partidas | Vitória | Empate | Derrota |', '|---|---|---|---|---|');
for (const [r, v] of Object.entries(report.winRateByRarity1v1)) md.push(`| ${r} | ${v.partidas} | ${(v.vitoria * 100).toFixed(1)}% | ${(v.empate * 100).toFixed(1)}% | ${(v.derrota * 100).toFixed(1)}% |`);
md.push('', '## Por linhagem (todos os modos)', '', '| Linhagem | Aparições | Vitória | Gols/partida | Duelos vencidos |', '|---|---|---|---|---|');
for (const [id, v] of Object.entries(report.byLineage)) md.push(`| ${id} | ${v.aparicoes} | ${(v.vitoria * 100).toFixed(1)}% | ${v.golsPorPartida} | ${(v.duelosVencidos * 100).toFixed(1)}% |`);
md.push('', '## Uso de habilidades', '', '| Habilidade | Linhagem | Tipo | Equipada | Usos | Usos/partida | Flow |', '|---|---|---|---|---|---|---|');
for (const v of Object.values(report.skills)) md.push(`| ${v.nome} | ${v.linhagem} | ${v.tipo} | ${v.equipadaEm} | ${v.usosComSucesso} | ${v.usosPorPartidaEquipada} | ${v.ativacoesDeFlow} |`);
md.push('', '## Placar mais comum', '');
for (const [k, v] of Object.entries(scoreDist).sort((a, b) => b[1] - a[1]).slice(0, 8)) md.push(`- ${k}: ${v}`);
writeFileSync(join(outDir, 'simulation.md'), md.join('\n'));
console.log(JSON.stringify(report.summary, null, 2));
console.log(md.slice(0, 30).join('\n'));
