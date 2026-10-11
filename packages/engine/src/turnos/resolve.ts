import { attackingGoalX, goalRows, inBounds, isInArea, key, ownGoalX, type Cell } from '../grid';
import { Rng } from '../rng';
import {
  adjacentOpponents,
  advance,
  attr,
  clone,
  currentActorId,
  dirOf,
  dropBall,
  finish,
  giveBall,
  goalDistance,
  holderOf,
  isGoalCell,
  isOn,
  keeperOf,
  kickoff,
  manh,
  nameOf,
  occupant,
  other,
  playersOn,
  reach,
  same,
  visBonus,
  between,
  walkable,
} from './core';
import { legalActions } from './legal';
import { CORNER_LABEL, PASS_PHRASE, TURNOS } from './rules';
import type { Action, ActionOpts, ActionResult, Corner, LegalSet, TEvent, TPlayer, TState } from './types';

export class TurnosError extends Error {}

// ---------------------------------------------------------------------------
// Rolagens
// ---------------------------------------------------------------------------

class Roll {
  parts: [string, number][] = [];
  add(label: string, v: number): this {
    if (v !== 0 || label === 'dado') this.parts.push([label, v]);
    return this;
  }
  get total(): number {
    return this.parts.reduce((a, [, v]) => a + v, 0);
  }
  text(): string {
    const body = this.parts.map(([l, v], i) => (v < 0 ? `${i === 0 ? '-' : '- '}${l} ${-v}` : `${i === 0 ? '' : '+ '}${l} ${v}`)).join(' ');
    return `${body} = **${this.total}**`;
  }
}

class Ctx {
  rng: Rng;
  log: string[] = [];
  events: TEvent[] = [];
  goal: 'A' | 'B' | null = null;
  /** O turno não avança: começou uma cobrança de falta. */
  keepTurn = false;
  constructor(
    public s: TState,
    public opts: ActionOpts,
  ) {
    this.rng = new Rng(s.rng);
  }
  d10(): number {
    return this.opts.dice?.length ? this.opts.dice.shift()! : this.rng.d10();
  }
  say(line: string) {
    this.log.push(line);
  }
  nm(id: string) {
    return nameOf(this.s, id);
  }
}

const verdict = (a: number, b: number): 'win' | 'tie' | 'lose' => (a > b ? 'win' : a === b ? 'tie' : 'lose');

// ---------------------------------------------------------------------------
// Bônus compartilhados
// ---------------------------------------------------------------------------

/** Outros marcadores colados no portador (além do que age). */
function coverage(s: TState, carrier: TPlayer, exceptId: string): number {
  return adjacentOpponents(s, carrier).filter((o) => o.id !== exceptId && !o.isKeeper).length * TURNOS.coverage;
}

/** +1 de Defesa se o goleiro do time está comandando este jogador e ele está na área. */
function commandBonus(s: TState, p: TPlayer): number {
  const k = playersOn(s).find((o) => o.team === p.team && o.isKeeper && o.posture === 'comandar' && o.commandAlly === p.id);
  return k && isInArea(p.pos, p.team, s.setup.field) ? TURNOS.keeper.comandar : 0;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function needsKeeperGuess(a: Action): boolean {
  return a.kind === 'chutar' || (a.kind === 'passe' && a.type === 'cruzamento');
}

/** Palpite do goleiro bot: o canto que o chutador mais usou (sem histórico: centro). */
export function botKeeperGuess(s: TState, shooterId: string): Corner {
  const h = s.shotHistory[shooterId] ?? [0, 0, 0];
  const max = Math.max(...h);
  for (const c of [1, 0, 2] as Corner[]) if (h[c] === max) return c;
  return 1;
}

function validate(L: LegalSet, a: Action): void {
  const bad = (m: string): never => {
    throw new TurnosError(m);
  };
  switch (a.kind) {
    case 'passar':
      return;
    case 'mover':
      if (!L.move.some((c) => same(c, a.dest))) bad('Você não alcança essa casa.');
      return;
    case 'bote':
      if (!L.bote) bad('Não há portador adversário colado em você.');
      return;
    case 'carrinho':
      if (!L.carrinho) bad('Não há portador adversário colado em você.');
      return;
    case 'conter':
      if (!L.conter.includes(a.target)) bad('Esse adversário não está colado em você.');
      return;
    case 'driblar':
      if (!L.driblar.some((d) => d.target === a.target)) bad('Não dá para driblar esse adversário (precisa estar colado e ter a casa de trás livre).');
      return;
    case 'passe': {
      const ok = L.passes[a.type].some((o) => same(o.to, a.to) && (a.type !== 'profundidade' || o.receiver === a.runner));
      if (!ok) bad('Esse passe não é possível daqui.');
      return;
    }
    case 'chutar':
      if (!L.chutar) bad('Você não pode chutar daqui.');
      if (![0, 1, 2].includes(a.corner)) bad('Canto inválido.');
      return;
    case 'goleiro': {
      const g = L.goleiro.find((x) => x.posture === a.posture);
      if (!g) bad('Essa postura não está disponível.');
      if (g && a.dest && !(g.dests ?? []).some((c) => same(c, a.dest!))) bad('O goleiro não alcança essa casa.');
      if (g && a.posture === 'comandar' && a.ally && !(g.allies ?? []).includes(a.ally)) bad('Esse jogador não está na área.');
      return;
    }
  }
}

/**
 * Aplica a ação de quem está na vez e devolve o novo estado (o original não muda).
 * A resolução é imediata: depois dela o jogo já passa para a próxima pessoa.
 */
export function applyAction(state0: TState, actorId: string, action: Action, opts: ActionOpts = {}): ActionResult {
  if (state0.finished) throw new TurnosError('A partida já terminou.');
  if (currentActorId(state0) !== actorId) throw new TurnosError('Não é a vez desse jogador.');
  validate(legalActions(state0, actorId), action);

  const s = clone(state0);
  const ctx = new Ctx(s, { ...opts, dice: opts.dice ? [...opts.dice] : undefined });
  const p = s.players[actorId];
  const half0 = s.half;
  p.stats.totalTurns++;
  if (action.kind !== 'passar') p.stats.activeTurns++;
  const pen = p.conter;
  p.conter = 0;
  p.fallen = false;
  const hadFreeKick = !!s.freeKick;

  switch (action.kind) {
    case 'passar':
      ctx.say(`${ctx.nm(p.id)} perdeu a vez.`);
      break;
    case 'mover':
      doMove(ctx, p, action.dest);
      break;
    case 'bote':
    case 'carrinho':
      doTackle(ctx, p, action.kind, pen);
      break;
    case 'conter':
      doConter(ctx, p, s.players[action.target], pen);
      break;
    case 'driblar':
      doDribble(ctx, p, s.players[action.target], pen);
      break;
    case 'passe':
      doPass(ctx, p, action, pen);
      break;
    case 'chutar':
      doShot(ctx, p, action.corner, { pen, header: false, penalty: s.freeKick?.kind === 'penalti', free: hadFreeKick });
      break;
    case 'goleiro':
      doKeeper(ctx, p, action);
      break;
  }

  s.rng = ctx.rng.state();
  s.turnCount++;
  const ft = s.setup.firstTo;
  if (ft && (s.score.A >= ft || s.score.B >= ft)) finish(s);
  if (!s.finished && !ctx.keepTurn) advance(s);
  if (s.half !== half0 && !s.finished) {
    ctx.events.push({ t: 'halftime' });
    ctx.say('Intervalo. A bola volta ao centro para o segundo tempo.');
  }
  if (s.finished) {
    ctx.events.push({ t: 'end', winner: s.winner! });
    ctx.say(s.winner === 'draw' ? `Fim de jogo: empate em ${s.score.A} a ${s.score.B}.` : `Fim de jogo: vitória do time ${s.winner} por ${s.score.A} a ${s.score.B}.`);
  }
  return { state: s, actor: actorId, log: ctx.log, events: ctx.events, goal: ctx.goal };
}

// ---------------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------------

function doMove(ctx: Ctx, p: TPlayer, dest: Cell) {
  const s = ctx.s;
  const from = { ...p.pos };
  p.pos = { ...dest };
  ctx.events.push({ t: 'move', id: p.id, from, to: { ...dest } });
  if (s.ball.holder === p.id) {
    s.ball.pos = { ...dest };
    ctx.say(`${ctx.nm(p.id)} avança com a bola.`);
  } else if (!s.ball.holder && same(s.ball.pos, dest)) {
    giveBall(s, p.id);
    ctx.say(`${ctx.nm(p.id)} chega primeiro e pega a bola solta.`);
  } else ctx.say(`${ctx.nm(p.id)} se movimenta.`);
}

// ---------------------------------------------------------------------------
// Desarme e Conter
// ---------------------------------------------------------------------------

function doTackle(ctx: Ctx, p: TPlayer, kind: 'bote' | 'carrinho', pen: number) {
  const s = ctx.s;
  const carrier = holderOf(s)!;
  const T = new Roll().add('Defesa', attr(s, p.id, 'defesa')).add('dado', ctx.d10());
  if (kind === 'carrinho') T.add('carrinho', TURNOS.carrinhoBonus);
  T.add('cobertura', coverage(s, carrier, p.id)).add('comando do goleiro', commandBonus(s, p)).add('Conter sofrido', -pen);
  const C = new Roll().add('Físico', attr(s, carrier.id, 'fisico')).add('dado', ctx.d10());
  const res = verdict(T.total, C.total);
  const label = kind === 'bote' ? 'o Bote' : 'o Carrinho';
  ctx.say(`${ctx.nm(p.id)} tenta ${label} em ${ctx.nm(carrier.id)}: ${T.text()} contra ${C.text()}.`);
  ctx.events.push({ t: 'duel', id: p.id, target: carrier.id, kind, result: res, cell: { ...carrier.pos } });
  if (res === 'win') {
    giveBall(s, p.id);
    p.stats.tackles++;
    p.stats.duelsWon++;
    carrier.stats.duelsLost++;
    ctx.say(`${ctx.nm(p.id)} rouba a bola.`);
    return;
  }
  if (res === 'tie') {
    ctx.say('Empate: nada acontece. O portador segue com a bola.');
    return;
  }
  p.stats.duelsLost++;
  carrier.stats.duelsWon++;
  const foulRoll = ctx.d10();
  if (foulRoll <= TURNOS.foul[kind]) {
    callFoul(ctx, p, carrier, kind);
    return;
  }
  if (kind === 'carrinho') {
    p.fallen = true;
    ctx.say(`${ctx.nm(p.id)} perde o lance e cai: não se move no próximo turno.`);
  } else ctx.say(`${ctx.nm(p.id)} não consegue tirar a bola.`);
}

function callFoul(ctx: Ctx, p: TPlayer, victim: TPlayer, kind: 'bote' | 'carrinho') {
  const s = ctx.s;
  p.fouls++;
  ctx.say(`Falta de ${ctx.nm(p.id)} em ${ctx.nm(victim.id)}!`);
  let card: 'amarelo' | 'vermelho' | null = null;
  if (ctx.d10() <= TURNOS.yellow[kind]) {
    p.yellow++;
    if (p.yellow >= 2) {
      card = 'vermelho';
      const alone = s.setup.slots.filter((x) => x.team === p.team && !x.isKeeper).length === 1;
      p.offUntil = alone ? s.round + TURNOS.redSuspension : 9999;
      ctx.say(`Segundo amarelo: ${ctx.nm(p.id)} é expulso${alone ? ` e fica fora por ${TURNOS.redSuspension} rodadas` : ''}.`);
    } else {
      card = 'amarelo';
      ctx.say(`Cartão amarelo para ${ctx.nm(p.id)}.`);
    }
  }
  ctx.events.push({ t: 'foul', id: p.id, victim: victim.id, card });
  const f = s.setup.field;
  if (isInArea(victim.pos, p.team, f)) {
    // pênalti: o jogador faltado vai para a marca
    const rows = goalRows(f);
    const gx = attackingGoalX(victim.team, f);
    const spot = { x: gx - dirOf(victim.team) * TURNOS.shot.penaltySpot, y: rows[Math.floor(rows.length / 2)] };
    const free = nearestFree(s, victim, spot);
    victim.pos = free;
    s.ball = { holder: victim.id, pos: { ...free } };
    s.freeKick = { player: victim.id, kind: 'penalti' };
    ctx.say(`Pênalti! ${ctx.nm(victim.id)} vai para a marca.`);
  } else {
    for (const o of adjacentOpponents(s, victim)) {
      const n = { x: o.pos.x + (o.pos.x - victim.pos.x), y: o.pos.y + (o.pos.y - victim.pos.y) };
      if (walkable(s, o, n)) o.pos = n;
    }
    s.ball = { holder: victim.id, pos: { ...victim.pos } };
    s.freeKick = { player: victim.id, kind: 'direto' };
    ctx.say(`Tiro livre para ${ctx.nm(victim.id)}: ele joga de novo agora, chutando ou passando.`);
  }
  ctx.keepTurn = true;
}

function nearestFree(s: TState, p: TPlayer, c: Cell): Cell {
  if (walkable(s, p, c)) return c;
  for (let r = 1; r < 6; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (manh(n, c) === r && walkable(s, p, n)) return n;
      }
  return p.pos;
}

function doConter(ctx: Ctx, p: TPlayer, target: TPlayer, pen: number) {
  const s = ctx.s;
  const A = new Roll().add('Defesa', attr(s, p.id, 'defesa')).add('dado', ctx.d10()).add('comando do goleiro', commandBonus(s, p)).add('Conter sofrido', -pen);
  const B = new Roll().add('Físico', attr(s, target.id, 'fisico')).add('dado', ctx.d10());
  const res = verdict(A.total, B.total);
  ctx.say(`${ctx.nm(p.id)} tenta conter ${ctx.nm(target.id)}: ${A.text()} contra ${B.text()}.`);
  ctx.events.push({ t: 'duel', id: p.id, target: target.id, kind: 'conter', result: res, cell: { ...target.pos } });
  if (res === 'win') {
    const carrier = s.ball.holder === target.id;
    target.conter = carrier ? TURNOS.conter.carrier : TURNOS.conter.normal;
    p.stats.duelsWon++;
    ctx.say(`${ctx.nm(target.id)} fica pressionado: -${target.conter} em tudo que fizer no próximo turno.`);
  } else if (res === 'tie') ctx.say('Empate: nada acontece.');
  else ctx.say(`${ctx.nm(target.id)} se desvencilha.`);
}

// ---------------------------------------------------------------------------
// Drible
// ---------------------------------------------------------------------------

function doDribble(ctx: Ctx, p: TPlayer, target: TPlayer, pen: number) {
  const s = ctx.s;
  const landing = { x: target.pos.x + (target.pos.x - p.pos.x), y: target.pos.y + (target.pos.y - p.pos.y) };
  const A = new Roll().add('Drible', attr(s, p.id, 'drible')).add('dado', ctx.d10()).add('Conter sofrido', -pen);
  const D = new Roll()
    .add('Defesa', attr(s, target.id, 'defesa'))
    .add('dado', ctx.d10())
    .add('cobertura', coverage(s, p, target.id))
    .add('comando do goleiro', commandBonus(s, target));
  const res = verdict(A.total, D.total);
  ctx.say(`${ctx.nm(p.id)} tenta driblar ${ctx.nm(target.id)}: ${A.text()} contra ${D.text()}.`);
  ctx.events.push({ t: 'duel', id: p.id, target: target.id, kind: 'drible', result: res, cell: { ...target.pos } });
  if (res === 'win') {
    ctx.events.push({ t: 'move', id: p.id, from: { ...p.pos }, to: { ...landing } });
    p.pos = landing;
    s.ball.pos = { ...landing };
    p.stats.dribblesWon++;
    p.stats.duelsWon++;
    target.stats.duelsLost++;
    ctx.say(`${ctx.nm(p.id)} passa por cima e cai atrás dele com a bola.`);
  } else if (res === 'tie') ctx.say('Empate: ninguém passa e nada muda.');
  else {
    giveBall(s, target.id);
    p.stats.dribblesLost++;
    p.stats.duelsLost++;
    target.stats.duelsWon++;
    target.stats.tackles++;
    ctx.say(`${ctx.nm(target.id)} desarma o drible e fica com a bola.`);
  }
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

type PassAction = Extract<Action, { kind: 'passe' }>;

function doPass(ctx: Ctx, p: TPlayer, a: PassAction, pen: number) {
  const s = ctx.s;
  const L = legalActions(s, p.id);
  const opt = L.passes[a.type].find((o) => same(o.to, a.to) && (a.type !== 'profundidade' || o.receiver === a.runner))!;
  const T = TURNOS.pass[a.type];
  const dist = opt.dist;
  const distPen = a.type === 'longo' || a.type === 'profundidade' ? Math.max(0, Math.ceil((dist - TURNOS.pass[a.type].free) / TURNOS.pass[a.type].every)) : 0;
  const R = new Roll()
    .add('Passe', attr(s, p.id, 'passe'))
    .add('dado', ctx.d10())
    .add('Visão', a.type === 'curto' ? 0 : visBonus(s, p.id))
    .add('distância', -distPen)
    .add('Conter sofrido', -pen);
  p.stats.passesAttempted++;
  const who = ctx.nm(p.id);
  const recvName = ctx.nm(opt.receiver);
  ctx.say(`${who} tenta ${PASS_PHRASE[a.type]} ${a.type === 'profundidade' ? `para ${recvName} correr` : `para ${recvName}`}: ${R.text()} (precisa de ${T.threshold}).`);
  const from = { ...p.pos };
  const evBase = { t: 'pass' as const, id: p.id, type: a.type, from, to: { ...a.to } };

  // interceptação no caminho
  const path = a.type === 'cruzamento' ? [] : (between(p.pos, a.to) ?? []);
  const opp = other(p.team);
  const cands: { who: TPlayer; bonus: number; idx: number }[] = [];
  if (a.type === 'curto' || a.type === 'profundidade') {
    path.forEach((c, idx) => {
      const o = occupant(s, c);
      if (o && o.team === opp && !o.isKeeper) cands.push({ who: o, bonus: 0, idx });
    });
  }
  const k = keeperOf(s, opp);
  if (k && k.posture === 'adiantar' && a.type !== 'cruzamento') {
    const idx = path.findIndex((c) => isInArea(c, opp, s.setup.field));
    if (idx >= 0) cands.push({ who: k, bonus: TURNOS.keeper.adiantarIntercept, idx });
  }
  cands.sort((x, y) => x.idx - y.idx);
  for (const c of cands) {
    const I = new Roll().add('Defesa', attr(s, c.who.id, 'defesa')).add('dado', ctx.d10()).add('Visão', visBonus(s, c.who.id)).add(c.who.isKeeper ? 'Adiantar linha' : 'posição', c.bonus);
    const res = verdict(I.total, R.total);
    ctx.say(`${ctx.nm(c.who.id)} tenta cortar: ${I.text()} contra ${R.total}.`);
    if (res === 'win') {
      giveBall(s, c.who.id);
      c.who.stats.interceptions++;
      ctx.events.push({ ...evBase, end: { ...c.who.pos }, result: 'cortado' });
      ctx.say(`${ctx.nm(c.who.id)} intercepta o passe.`);
      return;
    }
    if (res === 'tie') {
      ctx.events.push({ ...evBase, end: from, result: 'parou' });
      ctx.say('Empate na interceptação: o passe não sai e a bola fica com quem passou.');
      return;
    }
  }

  // precisão
  if (R.total < T.threshold) {
    const short = T.threshold - R.total;
    const steps = short >= 3 ? 2 : 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[ctx.rng.int(0, 3)];
    let end = { ...a.to };
    for (let i = 0; i < steps; i++) {
      const n = { x: end.x + dx, y: end.y + dy };
      if (inBounds(n, s.setup.field)) end = n;
    }
    const taker = dropBall(s, end);
    ctx.events.push({ ...evBase, end, result: 'solta' });
    ctx.say(taker ? `O passe sai torto e ${ctx.nm(taker)} fica com a bola.` : 'O passe sai torto e a bola fica solta.');
    return;
  }

  const r = s.players[opt.receiver];
  if (a.type === 'profundidade') return deepRace(ctx, p, r, a, evBase);
  complete(ctx, p, r);
  if (a.type === 'curto') {
    ctx.events.push({ ...evBase, end: { ...r.pos }, result: 'ok' });
    ctx.say(`${ctx.nm(r.id)} recebe.`);
    return;
  }
  if (a.type === 'longo') {
    ctx.events.push({ ...evBase, end: { ...r.pos }, result: 'ok' });
    if (highContest(ctx, r)) return;
    ctx.say(`${ctx.nm(r.id)} domina o lançamento.`);
    return;
  }
  // cruzamento
  ctx.events.push({ ...evBase, end: { ...r.pos }, result: 'ok' });
  const kp = keeperOf(s, opp);
  if (kp && kp.posture === 'sair' && manh(kp.pos, r.pos) <= TURNOS.keeper.claimRange) {
    const K = new Roll().add('Físico', attr(s, kp.id, 'fisico')).add('dado', ctx.d10()).add('Sair do gol', TURNOS.keeper.sairBonus);
    const Rv = new Roll().add('Físico', attr(s, r.id, 'fisico')).add('dado', ctx.d10());
    ctx.say(`${ctx.nm(kp.id)} sai do gol: ${K.text()} contra ${Rv.text()}.`);
    if (K.total > Rv.total) {
      giveBall(s, kp.id);
      kp.stats.saves++;
      ctx.say(`${ctx.nm(kp.id)} chega primeiro e abafa o cruzamento.`);
      return;
    }
  }
  if (highContest(ctx, r)) return;
  const hist = s.shotHistory[r.id] ?? [0, 0, 0];
  const min = Math.min(...hist);
  const corner = a.corner ?? (ctx.rng.pick([0, 1, 2].filter((c) => hist[c] === min)) as Corner);
  ctx.say(`${ctx.nm(r.id)} sobe livre para cabecear.`);
  doShot(ctx, r, corner, { pen: 0, header: true, penalty: false, free: false });
}

/** O passe chegou num aliado. */
function complete(ctx: Ctx, passer: TPlayer, receiver: TPlayer) {
  const s = ctx.s;
  giveBall(s, receiver.id);
  passer.stats.passesCompleted++;
  s.lastPass = { passer: passer.id, receiver: receiver.id, n: s.turnCount };
}

/** Disputa no alto contra um adversário colado no receptor. Retorna true se o adversário ficou com a bola. */
function highContest(ctx: Ctx, r: TPlayer): boolean {
  const s = ctx.s;
  const adj = adjacentOpponents(s, r);
  if (!adj.length) return false;
  const best = adj.reduce((a, b) => (attr(s, b.id, 'fisico') > attr(s, a.id, 'fisico') ? b : a));
  const D = new Roll().add('Físico', attr(s, best.id, 'fisico')).add('dado', ctx.d10());
  const Rv = new Roll().add('Físico', attr(s, r.id, 'fisico')).add('dado', ctx.d10());
  ctx.say(`${ctx.nm(best.id)} disputa no alto: ${D.text()} contra ${Rv.text()}.`);
  if (D.total > Rv.total) {
    giveBall(s, best.id);
    best.stats.interceptions++;
    ctx.say(`${ctx.nm(best.id)} ganha a disputa e fica com a bola.`);
    return true;
  }
  if (D.total === Rv.total) ctx.say('Empate: o passe segue.');
  return false;
}

function deepRace(ctx: Ctx, p: TPlayer, runner: TPlayer, a: PassAction, evBase: { t: 'pass'; id: string; type: PassAction['type']; from: Cell; to: Cell }) {
  const s = ctx.s;
  const cell = a.to;
  const comps = playersOn(s).filter((o) => o.team !== p.team && !o.isKeeper && manh(o.pos, cell) <= TURNOS.pass.profundidade.run && reach(s, o, TURNOS.pass.profundidade.run).some((c) => same(c, cell)));
  const Rr = new Roll().add('Velocidade', attr(s, runner.id, 'velocidade')).add('dado', ctx.d10());
  if (comps.length) {
    let best: { o: TPlayer; roll: Roll } | null = null;
    for (const o of comps) {
      const roll = new Roll().add('Velocidade', attr(s, o.id, 'velocidade')).add('dado', ctx.d10());
      if (!best || roll.total > best.roll.total) best = { o, roll };
    }
    ctx.say(`Corrida pela bola: ${ctx.nm(runner.id)} ${Rr.text()} contra ${ctx.nm(best!.o.id)} ${best!.roll.text()}.`);
    const res = verdict(Rr.total, best!.roll.total);
    if (res === 'lose') {
      best!.o.pos = { ...cell };
      giveBall(s, best!.o.id);
      best!.o.stats.interceptions++;
      ctx.events.push({ ...evBase, end: { ...cell }, result: 'cortado' });
      ctx.say(`${ctx.nm(best!.o.id)} chega antes e fica com a bola.`);
      return;
    }
    if (res === 'tie') {
      s.ball = { holder: null, pos: { ...cell } };
      ctx.events.push({ ...evBase, end: { ...cell }, result: 'disputa' });
      ctx.say('Empate na corrida: a bola fica solta e ninguém chega nela neste turno.');
      return;
    }
  }
  const runFrom = { ...runner.pos };
  runner.pos = { ...cell };
  complete(ctx, p, runner);
  ctx.events.push({ t: 'move', id: runner.id, from: runFrom, to: { ...cell } });
  ctx.events.push({ ...evBase, end: { ...cell }, result: 'ok' });
  ctx.say(`${ctx.nm(runner.id)} corre e pega a bola nas costas da marcação.`);
}

// ---------------------------------------------------------------------------
// Chute
// ---------------------------------------------------------------------------

interface ShotOpts {
  pen: number;
  header: boolean;
  penalty: boolean;
  free: boolean;
}

function doShot(ctx: Ctx, p: TPlayer, corner: Corner, o: ShotOpts) {
  const s = ctx.s;
  const f = s.setup.field;
  const dist = goalDistance(s, p.team, p.pos);
  const R = TURNOS.shot;
  const S = new Roll();
  if (o.header) S.add('(Chute+Físico)÷2', Math.floor((attr(s, p.id, 'chute') + attr(s, p.id, 'fisico')) / 2));
  else S.add('Chute', attr(s, p.id, 'chute'));
  S.add('dado', ctx.d10());
  if (!o.header && !o.penalty) {
    S.add(`distância (${dist})`, -(dist > R.freeDistance ? Math.ceil((dist - R.freeDistance) / R.penaltyEvery) : 0));
    if (!o.free) S.add('marcadores colados', -adjacentOpponents(s, p).filter((x) => !x.isKeeper).length * R.markerPenalty);
  }
  S.add('Conter sofrido', -o.pen);

  const hist = (s.shotHistory[p.id] ??= [0, 0, 0]);
  const k = keeperOf(s, other(p.team));
  const guess = ctx.opts.keeperGuess === undefined ? botKeeperGuess(s, p.id) : ctx.opts.keeperGuess;
  hist[corner]++;
  p.stats.shots++;
  const where = CORNER_LABEL[corner].toLowerCase();
  const head = o.header ? 'cabeceia' : o.penalty ? 'bate o pênalti' : o.free ? 'cobra a falta' : 'chuta';
  let K: Roll | null = null;
  if (k) {
    K = new Roll().add('Defesa', attr(s, k.id, 'defesa')).add('dado', ctx.d10());
    if (guess === corner) K.add('acertou o canto', R.keeperCorner);
    if (k.posture === 'adiantar') K.add('Adiantar linha', -R.adiantarPenalty);
  }
  const kText = K ? `${ctx.nm(k!.id)} (${guess === null ? 'não adivinhou' : `esperou ${CORNER_LABEL[guess].toLowerCase()}`}): ${K.text()}` : 'sem goleiro';
  ctx.say(`${ctx.nm(p.id)} ${head} no canto de ${where}: ${S.text()} contra ${kText}.`);
  const from = { ...p.pos };
  const res = K ? verdict(S.total, K.total) : 'win';
  if (res === 'win') {
    s.score[p.team]++;
    p.stats.goals++;
    let assist: string | null = null;
    const lp = s.lastPass;
    if (lp && lp.receiver === p.id && s.turnCount - lp.n <= s.order.length && s.players[lp.passer].team === p.team && lp.passer !== p.id) {
      assist = lp.passer;
      s.players[assist].stats.assists++;
    }
    ctx.events.push({ t: 'shot', id: p.id, from, corner, result: 'gol', header: o.header });
    ctx.events.push({ t: 'goal', team: p.team, scorer: p.id, assist });
    ctx.say(`GOL de ${ctx.nm(p.id)}!${assist ? ` Assistência de ${ctx.nm(assist)}.` : ''} Placar: A ${s.score.A} x ${s.score.B} B.`);
    ctx.goal = p.team;
    kickoff(s, other(p.team));
    return;
  }
  if (res === 'tie') {
    const gx = ownGoalX(other(p.team), f);
    const rows = goalRows(f);
    const cell = { x: gx - dirOf(p.team), y: rows[Math.floor(rows.length / 2)] };
    dropBall(s, cell);
    ctx.events.push({ t: 'shot', id: p.id, from, corner, result: 'rebote', header: o.header });
    ctx.say(`${ctx.nm(k!.id)} espalma e a bola sobra na frente do gol.`);
    return;
  }
  k!.stats.saves++;
  giveBall(s, k!.id);
  ctx.events.push({ t: 'shot', id: p.id, from, corner, result: 'defesa', header: o.header });
  ctx.say(`${ctx.nm(k!.id)} defende e fica com a bola.`);
}

// ---------------------------------------------------------------------------
// Goleiro
// ---------------------------------------------------------------------------

function doKeeper(ctx: Ctx, p: TPlayer, a: Extract<Action, { kind: 'goleiro' }>) {
  const s = ctx.s;
  p.posture = a.posture;
  p.commandAlly = a.posture === 'comandar' ? (a.ally ?? null) : null;
  if (a.dest && !same(a.dest, p.pos) && (a.posture === 'posicionar' || a.posture === 'sair')) {
    p.pos = { ...a.dest };
    if (!s.ball.holder && same(s.ball.pos, a.dest)) {
      giveBall(s, p.id);
      ctx.say(`${ctx.nm(p.id)} sai do gol e pega a bola.`);
      return;
    }
  }
  const text: Record<string, string> = {
    posicionar: 'se posiciona na área',
    adiantar: 'adianta a linha',
    comandar: a.ally ? `comanda ${ctx.nm(a.ally)} na defesa` : 'comanda a defesa',
    sair: 'fica pronto para sair do gol',
  };
  ctx.say(`${ctx.nm(p.id)} ${text[a.posture]}.`);
}

export { isGoalCell, isOn };
