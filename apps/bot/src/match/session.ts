import type { Message, SendableChannels } from 'discord.js';
import { RARITY_COLORS, getLineage } from '@ego/content';
import { turnos, type MatchSetup } from '@ego/engine';
import { abortMatch, createMatchRecord, saveSnapshot } from '@ego/db';
import { renderTurnosField } from '@ego/render';
import { cid } from '../router';
import { ButtonStyle, btn, edit, file, images, row, screen, sep, text, type Block, type ScreenSpec } from '../ui';
import { applyClick, guessScreen, newDraft, panelScreen, type Draft } from './panel';

type TState = turnos.TState;
type Action = turnos.Action;
type Corner = turnos.Corner;
const { TURNOS } = turnos;

export interface Participant {
  userId: string;
  characterId: string;
  slotId: string;
}

export type FinishHandler = (s: MatchSession) => Promise<ScreenSpec | null>;

/** Uma jogada guardada: serve para retomar e para reproduzir a partida. */
export interface TurnLog {
  actor: string;
  action: Action;
  guess?: Corner | null;
  log: string[];
}

export interface SessionInit {
  guildId: string;
  channel: SendableChannels;
  setup: MatchSetup;
  participants: Participant[];
  stageId?: string | null;
  onFinish: FinishHandler;
  resume?: { state: TState; turns: TurnLog[] };
  label: string;
}

export const sessions = new Map<string, MatchSession>();
export const sessionByChannel = new Map<string, string>();
export const sessionByUser = new Map<string, string>();

/** Pausa entre as jogadas dos bots, para dar tempo de ler (os testes zeram isto). */
const BOT_DELAY_MS = Number(process.env.EGO_BOT_DELAY_MS ?? 1100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MatchSession {
  id: string;
  guildId: string;
  channel: SendableChannels;
  setup: MatchSetup;
  state: TState;
  turns: TurnLog[] = [];
  participants: Participant[];
  phase: 'turn' | 'guess' | 'busy' | 'finished' = 'busy';
  stageId: string | null;
  label: string;
  message: Message | null = null;
  drafts = new Map<string, Draft>();
  left = new Set<string>();
  deadline = 0;
  onFinish: FinishHandler;
  /** Últimas linhas de narração mostradas na mensagem. */
  recent: string[] = [];
  private lastEvents: turnos.TEvent[] = [];
  private pending: { actor: string; action: Action; keeperId: string } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private warnTimer: NodeJS.Timeout | null = null;
  private running = false;
  private rerun = false;
  private warned = false;

  constructor(init: SessionInit) {
    this.id = init.setup.id;
    this.guildId = init.guildId;
    this.channel = init.channel;
    this.setup = init.setup;
    this.participants = init.participants;
    this.stageId = init.stageId ?? null;
    this.onFinish = init.onFinish;
    this.label = init.label;
    this.state = init.resume?.state ?? (null as unknown as TState);
    this.turns = init.resume?.turns ?? [];
  }

  // ---------------------------------------------------------------------------
  // Quem é quem
  // ---------------------------------------------------------------------------

  slotOfUser(userId: string): string | null {
    return this.participants.find((p) => p.userId === userId)?.slotId ?? null;
  }

  private userOfSlot(slotId: string): string | null {
    return this.participants.find((p) => p.slotId === slotId)?.userId ?? null;
  }

  /** O jogador é uma pessoa que ainda está na partida (senão joga a IA). */
  isActiveHuman(slotId: string): boolean {
    const u = this.userOfSlot(slotId);
    return !!u && !this.left.has(u);
  }

  actor(): string {
    return turnos.currentActorId(this.state);
  }

  private nm(id: string) {
    return turnos.nameOf(this.state, id);
  }

  register() {
    sessions.set(this.id, this);
    sessionByChannel.set(this.channel.id, this.id);
    for (const p of this.participants) sessionByUser.set(p.userId, this.id);
  }

  unregister() {
    sessions.delete(this.id);
    if (sessionByChannel.get(this.channel.id) === this.id) sessionByChannel.delete(this.channel.id);
    for (const p of this.participants) if (sessionByUser.get(p.userId) === this.id) sessionByUser.delete(p.userId);
    this.clearTimers();
  }

  private clearTimers() {
    for (const t of [this.timer, this.warnTimer]) if (t) clearTimeout(t);
    this.timer = this.warnTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------

  async start(initial: TState, isNew: boolean) {
    this.state = initial;
    this.register();
    if (isNew) await createMatchRecord({ guildId: this.guildId, channelId: this.channel.id, mode: this.setup.mode, kind: this.setup.kind, setup: this.setup, stageId: this.stageId });
    this.recent = [isNew ? 'Apito inicial. A avaliação começou.' : 'Partida retomada depois de um reinício.'];
    await saveSnapshot(this.id, this.state, this.turns, null).catch((e) => console.error('[partida] snapshot', e));
    void this.step();
  }

  // ---------------------------------------------------------------------------
  // Mensagem pública
  // ---------------------------------------------------------------------------

  private roster(): string {
    const part = (team: 'A' | 'B') =>
      this.setup.slots
        .filter((s) => s.team === team)
        .map((s) => `${s.id} #${s.number} ${s.name}`)
        .join(' · ');
    return `-# **A** (azul): ${part('A')}\n-# **B** (branco): ${part('B')}`;
  }

  private statusLine(): string {
    const s = this.state;
    if (this.phase === 'finished' || s.finished) return '### Partida encerrada';
    const closes = `<t:${Math.floor(this.deadline / 1000)}:R>`;
    const a = this.actor();
    if (this.phase === 'guess' && this.pending) {
      const k = this.userOfSlot(this.pending.keeperId);
      return `### Goleiro${k ? ` <@${k}>` : ''}: escolha o canto · fecha ${closes}\n${this.nm(this.pending.actor)} vai finalizar. Clique em **Escolher canto**: o painel é só seu.`;
    }
    const u = this.userOfSlot(a);
    if (this.phase === 'turn' && u) {
      const free = s.freeKick ? (s.freeKick.kind === 'penalti' ? ' · pênalti' : ' · tiro livre') : '';
      return `### Vez de <@${u}> (${this.nm(a)})${free} · fecha ${closes}\n-# Clique em **Jogar meu turno**: o painel é só seu. Quem não joga a tempo perde a vez.${s.turnCount < 6 ? ' Primeira vez? Use **Como jogar** ou **/tutorial**.' : ''}`;
    }
    return `### Vez de ${this.nm(a)}${this.isActiveHuman(a) ? '' : ' (bot)'}`;
  }

  publicSpec(withFiles: boolean, frozen = false): ScreenSpec {
    const s = this.state;
    const sub = s.finished ? 'Fim de partida' : `Rodada ${Math.min(s.roundInHalf, s.setup.turnsPerHalf)} de ${s.setup.turnsPerHalf} · ${s.half}º tempo`;
    const blocks: Block[] = [text(`## A ${s.score.A} : ${s.score.B} B\n-# ${this.label} · ${sub}`), images('campo.png')];
    if (this.recent.length) blocks.push(text(this.recent.map((l) => `> ${l}`).join('\n').slice(0, 2400)));
    blocks.push(sep());
    if (!frozen) {
      blocks.push(text(this.statusLine()));
      const buttons = [];
      if (this.phase === 'turn') buttons.push(btn(cid('mt', 'play', this.id), 'Jogar meu turno', ButtonStyle.Primary));
      if (this.phase === 'guess') buttons.push(btn(cid('mt', 'guess', this.id), 'Escolher canto', ButtonStyle.Primary));
      if (this.phase !== 'finished') buttons.push(btn(cid('mt', 'help', this.id), 'Como jogar', ButtonStyle.Secondary));
      if (buttons.length) blocks.push(row(...buttons));
    }
    blocks.push(text(this.roster()));
    const low = !frozen && this.phase !== 'busy' && this.phase !== 'finished' && this.deadline - Date.now() < 10_000;
    const spec: ScreenSpec = { accent: low || this.warned ? 'aviso' : 'padrao', blocks };
    if (withFiles) spec.files = [file(this.image(), 'campo.png')];
    return spec;
  }

  private image(): Buffer {
    return renderTurnosField(this.state, { actor: this.state.finished ? null : this.actor(), events: this.lastEvents, hudRight: this.label.toUpperCase() });
  }

  /** Mensagem nova no canal (a anterior vira registro, sem botões). */
  private async post() {
    const old = this.message;
    if (old) await old.edit({ components: edit(this.publicSpec(false, true)).components }).catch(() => {});
    this.message = null;
    try {
      this.message = await this.channel.send(screen(this.publicSpec(true)));
    } catch (e) {
      console.error('[partida] falha ao postar', e);
    }
  }

  /** Reedita a mensagem atual; se ela sumiu, posta outra. */
  async refresh(withFiles = false) {
    if (!this.message) return this.post();
    try {
      const spec = this.publicSpec(withFiles);
      if (withFiles) await this.message.edit(edit(spec));
      else await this.message.edit({ components: edit(spec).components });
    } catch (e) {
      console.error('[partida] falha ao editar mensagem', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Laço de turnos
  // ---------------------------------------------------------------------------

  /** Joga os turnos dos bots até chegar a uma pessoa (ou ao fim). */
  private async step(): Promise<void> {
    if (this.running) {
      // alguém jogou enquanto o laço ainda fechava o turno anterior: roda de novo no fim
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      for (;;) {
        if (this.state.finished) return await this.finish();
        const a = this.actor();
        if (this.isActiveHuman(a)) return await this.openTurn();
        this.phase = 'busy';
        await sleep(BOT_DELAY_MS);
        if (!sessions.has(this.id)) return;
        const waiting = await this.act(a, turnos.chooseAction(this.state, a));
        if (waiting) return;
      }
    } catch (e) {
      console.error('[partida] erro no laço de turnos', e);
      await abortMatch(this.id, 'erro no laço de turnos').catch(() => {});
      this.phase = 'finished';
      this.recent = ['A partida foi interrompida por um erro do sistema. Nenhuma recompensa foi aplicada.'];
      await this.refresh(false);
      this.unregister();
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        void this.step();
      }
    }
  }

  /** Aplica a ação. Retorna true se ficou esperando o palpite de um goleiro humano. */
  private async act(actor: string, action: Action): Promise<boolean> {
    if (turnos.needsKeeperGuess(action)) {
      const k = turnos.keeperOf(this.state, turnos.other(this.state.players[actor].team));
      if (k && this.isActiveHuman(k.id)) {
        await this.openGuess(actor, action, k.id);
        return true;
      }
    }
    await this.commit(actor, action, undefined);
    return false;
  }

  private async commit(actor: string, action: Action, guess: Corner | null | undefined) {
    this.clearTimers();
    this.phase = 'busy';
    this.pending = null;
    this.warned = false;
    const bot = !this.isActiveHuman(actor);
    let res: turnos.ActionResult;
    try {
      res = turnos.applyAction(this.state, actor, action, { keeperGuess: guess });
    } catch (e) {
      if (!bot) throw e;
      console.error('[partida] ação de bot inválida, passando a vez', e);
      res = turnos.applyAction(this.state, actor, { kind: 'passar' });
    }
    this.state = res.state;
    this.turns.push({ actor, action, ...(guess !== undefined ? { guess } : {}), log: res.log });
    this.recent = [...this.recent, ...res.log].slice(-7);
    this.lastEvents = res.events;
    const big = !!res.goal || res.events.some((e) => e.t === 'halftime') || this.state.finished;
    if (big || !this.message) await this.post();
    else await this.refresh(true);
    await saveSnapshot(this.id, this.state, this.turns, this.message?.id ?? null).catch((e) => console.error('[partida] snapshot', e));
  }

  private async openTurn() {
    this.phase = 'turn';
    this.warned = false;
    this.drafts.clear();
    this.deadline = Date.now() + TURNOS.turnSeconds * 1000;
    const at = this.stamp();
    await this.post();
    // a pessoa pode ter jogado enquanto a mensagem saía: aí este relógio já não vale
    if (this.stamp() === at) this.arm();
    await saveSnapshot(this.id, this.state, this.turns, this.message?.id ?? null).catch(() => {});
  }

  private async openGuess(actor: string, action: Action, keeperId: string) {
    this.pending = { actor, action, keeperId };
    this.phase = 'guess';
    this.warned = false;
    this.deadline = Date.now() + TURNOS.keeperSeconds * 1000;
    const at = this.stamp();
    await this.refresh(false);
    if (this.stamp() === at) this.arm();
  }

  /** Identifica o momento da partida (fase + turno): relógios velhos não disparam. */
  private stamp(): string {
    return `${this.phase}:${this.state.turnCount}`;
  }

  /** Relógio do turno atual (ou do palpite). */
  private arm() {
    this.clearTimers();
    const left = Math.max(0, this.deadline - Date.now());
    const at = this.stamp();
    this.timer = setTimeout(() => {
      if (this.stamp() === at) void this.timeout();
    }, left);
    this.warnTimer = setTimeout(() => {
      if (this.stamp() !== at) return;
      this.warned = true;
      void this.refresh(false);
    }, Math.max(0, left - 10_000));
  }

  /** Acabou o tempo: perde a vez (ou o goleiro não adivinha). */
  private async timeout() {
    if (this.phase === 'guess' && this.pending) {
      const p = this.pending;
      await this.commit(p.actor, p.action, null).catch((e) => console.error(e));
      return void this.step();
    }
    if (this.phase !== 'turn') return;
    await this.commit(this.actor(), { kind: 'passar' }, undefined).catch((e) => console.error(e));
    void this.step();
  }

  // ---------------------------------------------------------------------------
  // Painéis (mensagens só do jogador)
  // ---------------------------------------------------------------------------

  private draftFor(userId: string): Draft {
    let d = this.drafts.get(userId);
    if (!d) {
      d = newDraft();
      this.drafts.set(userId, d);
    }
    return d;
  }

  /** O jogador da vez. `null` se não for a vez dele. */
  turnOf(userId: string): string | null {
    if (this.phase !== 'turn') return null;
    const slot = this.slotOfUser(userId);
    return slot && slot === this.actor() && !this.left.has(userId) ? slot : null;
  }

  panel(userId: string): ScreenSpec {
    const actorId = this.turnOf(userId)!;
    return panelScreen({ matchId: this.id, state: this.state, actorId, draft: this.draftFor(userId), deadline: this.deadline });
  }

  /** Clique no painel. Devolve a próxima tela, ou a ação confirmada. */
  click(userId: string, verb: string, arg: string | undefined, values: string[] | null): { screen: ScreenSpec } | { action: Action } {
    const actorId = this.turnOf(userId)!;
    const draft = this.draftFor(userId);
    const r = applyClick(this.state, actorId, draft, verb, arg, values);
    if (r.kind === 'act') return { action: r.action };
    return { screen: panelScreen({ matchId: this.id, state: this.state, actorId, draft, deadline: this.deadline }) };
  }

  /** A pessoa confirmou a jogada. */
  async humanAct(userId: string, action: Action) {
    const actor = this.turnOf(userId);
    if (!actor) throw new Error('Não é mais a sua vez.');
    this.clearTimers();
    let waiting: boolean;
    try {
      waiting = await this.act(actor, action);
    } catch (e) {
      this.phase = 'turn';
      this.arm();
      throw e;
    }
    if (!waiting) void this.step();
  }

  guessPanel(userId: string): ScreenSpec | null {
    if (this.phase !== 'guess' || !this.pending) return null;
    if (this.slotOfUser(userId) !== this.pending.keeperId || this.left.has(userId)) return null;
    return guessScreen({ matchId: this.id, state: this.state, shooterId: this.pending.actor, keeperId: this.pending.keeperId, deadline: this.deadline });
  }

  async guess(userId: string, corner: Corner) {
    if (!this.guessPanel(userId)) throw new Error('A janela do palpite já fechou.');
    const p = this.pending!;
    this.clearTimers();
    await this.commit(p.actor, p.action, corner);
    void this.step();
  }

  // ---------------------------------------------------------------------------
  // Fim
  // ---------------------------------------------------------------------------

  async finish() {
    this.clearTimers();
    this.phase = 'finished';
    try {
      const spec = await this.onFinish(this);
      if (spec) await this.channel.send(screen(spec));
    } catch (e) {
      console.error('[partida] erro ao encerrar', e);
      await this.channel.send(screen({ accent: 'erro', blocks: [text('A partida terminou, mas houve um problema ao registrar o resultado. Avise a gerência do servidor.')] }));
    }
    this.unregister();
  }

  /** Encerramento administrativo: sem recompensas. */
  async abort(reason: string) {
    this.clearTimers();
    this.phase = 'finished';
    this.recent = [reason];
    await abortMatch(this.id, reason);
    await this.refresh(false);
    this.unregister();
  }

  /** Sai da partida: a IA assume a vaga até o fim. */
  leave(userId: string) {
    this.left.add(userId);
    this.drafts.delete(userId);
    sessionByUser.delete(userId);
    const slot = this.slotOfUser(userId);
    const myTurn = this.phase === 'turn' && slot === this.actor();
    const myGuess = this.phase === 'guess' && this.pending?.keeperId === slot;
    if (myTurn || myGuess) void this.timeout();
    else void this.refresh(false);
  }

  teamColor(team: 'A' | 'B'): string {
    const s = this.setup.slots.find((x) => x.team === team && !x.isKeeper);
    return s ? (team === 'A' ? s.color : '#F2F4F8') : RARITY_COLORS.comum;
  }

  rarityOf(slotId: string) {
    return getLineage(this.setup.slots.find((s) => s.id === slotId)!.lineageId).rarity;
  }
}
