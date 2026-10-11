import { botSlot, keeperSlot } from '../src/bots';
import { buildSetup } from '../src/setup';
import { turnos } from '../src';

/**
 * Simulação do jogo de turnos individuais.
 *   pnpm --filter @ego/engine exec tsx scripts/turnos-sim.ts            -> 200 partidas 1v1..3v3, resumo
 *   pnpm --filter @ego/engine exec tsx scripts/turnos-sim.ts trace 2v2 demo -> narra uma partida
 */
const LIN = ['chigiri', 'isagi', 'lavinho', 'gagamaru', 'kuon'];

function build(mode: '1v1' | '2v2' | '3v3' | '4v4' | '5v5', seed: string, level = 15) {
  const n = Number(mode[0]);
  const slots = [];
  for (const t of ['A', 'B'] as const) {
    for (let i = 0; i < n; i++) {
      const lin = LIN[(i + (t === 'A' ? 0 : 2)) % 5];
      slots.push(botSlot({ name: `${t}${i + 1}-${lin}`, lineageId: lin, level, personality: 'coletivo', position: i === 0 ? 'atacante' : i % 2 ? 'defensor' : 'meio' }, `${t}${i + 1}`, t, 'regular'));
    }
    slots.push(keeperSlot(`${t}GK`, t, level, 'regular'));
  }
  const setup = buildSetup({ id: 'sim', seed, mode, kind: 'simulacao', slots, turnsPerHalf: turnos.TURNOS.roundsPerHalf, halves: turnos.TURNOS.halves });
  return turnos.createTurnos(setup);
}

function play(mode: '1v1' | '2v2' | '3v3' | '4v4' | '5v5', seed: string, verbose = false) {
  let s = build(mode, seed);
  const stat = { goals: 0, fouls: 0, yellow: 0, red: 0, shots: 0, passes: 0, passOk: 0, steals: 0, dribbles: 0, turns: 0 };
  let guard = 0;
  while (!s.finished && guard++ < 5000) {
    const { actor, action } = turnos.autoAction(s);
    const r = turnos.applyAction(s, actor, action);
    if (verbose) console.log(`R${s.round} [${actor}] ${r.log.join(' ')}`);
    for (const e of r.events) {
      if (e.t === 'goal') stat.goals++;
      if (e.t === 'foul') {
        stat.fouls++;
        if (e.card === 'amarelo') stat.yellow++;
        if (e.card === 'vermelho') stat.red++;
      }
      if (e.t === 'shot') stat.shots++;
      if (e.t === 'pass') stat.passes++;
      if (e.t === 'pass' && e.result === 'ok') stat.passOk++;
      if (e.t === 'duel' && e.result === 'win' && (e.kind === 'bote' || e.kind === 'carrinho')) stat.steals++;
      if (e.t === 'duel' && e.kind === 'drible') stat.dribbles++;
    }
    s = r.state;
    stat.turns++;
  }
  return { s, stat, stuck: guard >= 5000 };
}

const [cmd, mode = '2v2', seed = 'demo'] = process.argv.slice(2);
if (cmd === 'trace') {
  const { s } = play(mode as '2v2', seed, true);
  console.log(`\nFinal: A ${s.score.A} x ${s.score.B} B`);
} else {
  for (const m of ['1v1', '2v2', '3v3', '4v4', '5v5'] as const) {
    const N = Number(cmd) || 100;
    const tot = { goals: 0, fouls: 0, yellow: 0, red: 0, shots: 0, passes: 0, passOk: 0, steals: 0, dribbles: 0, turns: 0 };
    let stuck = 0;
    let draws = 0;
    let aWins = 0;
    const dist: Record<number, number> = {};
    for (let i = 0; i < N; i++) {
      const { s, stat, stuck: st } = play(m, `sim-${m}-${i}`);
      for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += stat[k];
      if (st) stuck++;
      if (s.winner === 'draw') draws++;
      if (s.winner === 'A') aWins++;
      const g = s.score.A + s.score.B;
      dist[g] = (dist[g] ?? 0) + 1;
    }
    const f = (x: number) => (x / N).toFixed(2);
    console.log(
      `${m}: gols ${f(tot.goals)}/jogo · chutes ${f(tot.shots)} · passes ${f(tot.passes)} (certos ${((100 * tot.passOk) / Math.max(1, tot.passes)).toFixed(0)}%) · desarmes ${f(tot.steals)} · dribles ${f(tot.dribbles)} · faltas ${f(tot.fouls)} (am ${f(tot.yellow)}, verm ${f(tot.red)}) · turnos ${f(tot.turns)} · empates ${draws} · vit.A ${aWins} · travadas ${stuck}`,
    );
    console.log(`   distribuição de gols: ${Object.entries(dist).map(([g, n]) => `${g}:${n}`).join(' ')}`);
  }
}
