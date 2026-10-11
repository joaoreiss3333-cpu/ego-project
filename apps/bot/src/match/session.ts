import type { Message, SendableChannels } from 'discord.js';
import { MATCH_RULES, RARITY_COLORS, getLineage } from '@ego/content';
import {
  AFK_OVERRIDE,
  getReactionRequests,
  normalizePlans,
  planBots,
  publicRevelation,
  reactBot,
  resolveTurn,
  type MatchSetup,
  type MatchState,
  type PlanMap,
  type ReactionRequest,
  type TeamDebug,
  type TurnResult,
} from '@ego/engine';
import { abortMatch, createMatchRecord, saveSnapshot } from '@ego/db';
import { arrowsFromResult, arrowsFromRevelation, overlaysFromResult, renderField, renderStepsGif, turnBanner } from '@ego/render';
import { cid } from '../router';
import { ButtonStyle, btn, edit, file, images, row, screen, sep, text, type Block, type ScreenSpec } from '../ui';
import { explainBlocks } from './explain';
import { applyClick, draftToPlan, nameOf, newDraft, panelScreen, planToDraft, type Draft } from './panel';

export interface Participant {
  userId: string;
  characterId: string;
  slotId: string;
}

export type FinishHandler = (s: MatchSession) => Promise<ScreenSpec | null>;

export interface SessionInit {
  guildId: string;
  channel: SendableChannels;
  setup: MatchSetup;
  participants: Participant[];
  planSeconds: number;
  gifEnabled: boolean;
  stageId?: string | null;
  onFinish: FinishHandler;
  /** Estado e lances já jogados (retomada após reinício). */
  resume?: { state: MatchState; turns: PlanMap[] };
  label: string;
}

export const sessions = new Map<string, MatchSession>();
export const sessionByChannel = new Map<string, string>();
export const sessionByUser = new Map<string, string>();

export class MatchSession {
  id: string;
  guildId: string;
  channel: SendableChannels;
  setup: MatchSetup;
  state: MatchState;
  turns: PlanMap[] = [];
  participants: Participant[];
  phase: 'planning' | 'reaction' | 'resolving' | 'finished' = 'planning';
  planSeconds: number;
  gifEnabled: boolean;
  stageId: string | null;
  label: string;
  message: Message | null = null;
  humanPlans: PlanMap = {};
  drafts = new Map<string, Draft>();
  left = new Set<string>();
  deadline = 0;
  private timer: NodeJS.Timeout | null = null;
  private warnTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private pendingPlans: PlanMap = {};
  reactions: ReactionRequest[] = [];
  reactionDone = new Set<string>();
  lastLog: string[] = [];
  /** Imagem da mensagem pública: GIF do último lance ou PNG do campo. */
  lastImage: { name: 'lance.gif' | 'campo.png'; data: Buffer } | null = null;
  /** "Lance 3 de 8 · 1º tempo" do lance da mensagem atual. */
  lanceLabel = '';
  debugAi = false;
  debugMessage: Message | null = null;
  lastDebug: TeamDebug[] = [];
  onFinish: FinishHandler;
  private warned = false;

  constructor(init: SessionInit) {
    this.id = init.setup.id;
    this.guildId = init.guildId;
    this.channel = init.channel;
    this.setup = init.setup;
    this.participants = init.participants;
    this.planSeconds = init.planSeconds;
    this.gifEnabled = init.gifEnabled;
    this.stageId = init.stageId ?? null;
    this.onFinish = init.onFinish;
    this.label = init.label;
    if (init.resume) {
      this.state = init.resume.state;
      this.turns = init.resume.turns;
    } else {
      // definido em start()
      this.state = null as unknown as MatchState;
    }
  }

  // ---------------------------------------------------------------------------

  slotOfUser(userId: string): string | null {
    return this.participants.find((p) => p.userId === userId)?.slotId ?? null;
  }

  humanSlots(): string[] {
    return this.participants.filter((p) => !this.left.has(p.userId)).map((p) => p.slotId);
  }

  botSlots(): string[] {
    return this.setup.slots.filter((s) => s.isBot).map((s) => s.id);
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
    for (const t of [this.timer, this.warnTimer, this.statusTimer]) if (t) clearTimeout(t);
    this.timer = this.warnTimer = this.statusTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------

  async start(initial: MatchState, isNew: boolean) {
    this.state = initial;
    this.register();
    if (isNew) await createMatchRecord({ guildId: this.guildId, channelId: this.channel.id, mode: this.setup.mode, kind: this.setup.kind, setup: this.setup, stageId: this.stageId });
    await this.openLance(isNew ? 'Apito inicial. A avaliação começou.' : 'Partida retomada depois de um reinício.');
    await saveSnapshot(this.id, this.state, this.turns, this.message?.id ?? null);
  }

  // ---------------------------------------------------------------------------
  // Mensagem pública
  // ---------------------------------------------------------------------------

  private statusLine(): string {
    const humans = this.humanSlots();
    const names = (xs: string[]) => xs.map((s) => nameOf(this.state, s)).join(', ');
    const closes = `<t:${Math.floor(this.deadline / 1000)}:R>`;
    if (this.phase === 'planning') {
      const ready = humans.filter((s) => this.humanPlans[s]);
      const waiting = humans.filter((s) => !this.humanPlans[s]);
      const lines = [`### Sua vez de planejar · fecha ${closes}`];
      lines.push(waiting.length ? `Prontos **${ready.length}/${humans.length}** · faltam: ${names(waiting)}` : `Todos prontos. Resolvendo...`);
      lines.push('-# Clique em **Planejar meu lance**: o painel é só seu. Quem não confirmar a tempo joga no automático.');
      if (this.state.turn <= 2) lines.push('-# Primeira vez? Clique em **Como jogar** ou use **/tutorial**.');
      return lines.join('\n');
    }
    if (this.phase === 'reaction') {
      const pend = this.reactions.filter((r) => this.isHumanSlot(r.playerId) && !this.reactionDone.has(r.playerId));
      return `### Janela de reação · fecha ${closes}\n${pend.length ? `${names(pend.map((r) => r.playerId))} pode ajustar o plano com uma habilidade de reação.` : 'Reações registradas.'}\n-# As setas mostram para onde cada um vai. A ação de cada um continua secreta.`;
    }
    if (this.phase === 'resolving') return '### Resolvendo o lance...';
    return '### Partida encerrada';
  }

  private isHumanSlot(slotId: string): boolean {
    return this.participants.some((p) => p.slotId === slotId && !this.left.has(p.userId));
  }

  /** Nome do anexo mostrado: o GIF do último lance, se houver, senão a imagem do campo. Uma imagem só, em largura total. */
  private imageName(): string {
    return this.lastImage?.name ?? 'campo.png';
  }

  /** Mensagem do lance em andamento (planejamento, revelação, reação). */
  publicSpec(withFiles: boolean): ScreenSpec {
    const s = this.state;
    const sub = s.finished ? 'Fim de partida' : this.lanceLabel;
    const blocks: Block[] = [text(`## A ${s.score.A} : ${s.score.B} B\n-# ${this.label} · ${sub}`), images(this.imageName())];
    if (this.lastLog.length) blocks.push(text(this.lastLog.map((l) => `> ${l}`).join('\n')));
    blocks.push(sep());
    blocks.push(text(this.statusLine()));
    const buttons = [];
    if (this.phase === 'planning') buttons.push(btn(cid('mt', 'plan', this.id), 'Planejar meu lance', ButtonStyle.Primary));
    if (this.phase === 'reaction') buttons.push(btn(cid('mt', 'react', this.id), 'Usar minha reação', ButtonStyle.Primary));
    if (this.phase !== 'finished') buttons.push(btn(cid('mt', 'help', this.id), 'Como jogar', ButtonStyle.Secondary));
    if (buttons.length) blocks.push(row(...buttons));
    const lowTime = this.phase !== 'finished' && this.deadline - Date.now() < 10_000 && this.deadline > Date.now();
    const spec: ScreenSpec = { accent: lowTime || this.warned ? 'aviso' : 'padrao', blocks };
    if (withFiles && this.lastImage) spec.files = [file(this.lastImage.data, this.lastImage.name)];
    return spec;
  }

  /**
   * Registro do lance resolvido: a mesma mensagem do lance vira o GIF do que
   * aconteceu, sem botões. O lance seguinte sai numa mensagem nova, embaixo.
   */
  private recordSpec(prev: MatchState, result: TurnResult): ScreenSpec {
    const s = this.state;
    const blocks: Block[] = [text(`## A ${s.score.A} : ${s.score.B} B\n-# ${this.label} · ${this.lanceLabel} · resultado`), images(this.imageName())];
    if (this.lastLog.length) blocks.push(text(this.lastLog.map((l) => `> ${l}`).join('\n')));
    blocks.push(...explainBlocks(prev, result));
    blocks.push(text(s.finished ? '-# Fim de partida. O relatório vem logo abaixo.' : '-# Lance encerrado. O próximo lance está logo abaixo.'));
    const spec: ScreenSpec = { accent: result.goal ? 'sucesso' : 'padrao', blocks };
    if (this.lastImage) spec.files = [file(this.lastImage.data, this.lastImage.name)];
    return spec;
  }

  /** Reedita a mensagem pública. Sem `withFiles`, mantém as imagens já anexadas. */
  async refresh(withFiles = false) {
    if (!this.message) return;
    try {
      const spec = this.publicSpec(withFiles);
      if (withFiles) await this.message.edit(edit(spec));
      else await this.message.edit({ components: edit(spec).components });
    } catch (e) {
      console.error('[partida] falha ao editar mensagem', e);
    }
  }

  /** Atualização de status com debounce (evita limite de edição do Discord). */
  private refreshSoon() {
    if (this.statusTimer) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      void this.refresh(false);
    }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Planejamento
  // ---------------------------------------------------------------------------

  /**
   * Abre um lance: posta uma mensagem nova no canal (o chat fica livre durante
   * a partida, então a mensagem do lance anterior já subiu) e começa o relógio.
   */
  async openLance(notice: string | null = null) {
    this.clearTimers();
    this.phase = 'planning';
    this.humanPlans = {};
    this.drafts.clear();
    this.warned = false;
    const s = this.state;
    const total = s.setup.turnsPerHalf;
    this.lanceLabel = `Lance ${Math.min(s.turnInHalf, total)} de ${total} · ${s.half}º tempo`;
    this.lastLog = notice ? [notice] : [];
    this.lastImage = { name: 'campo.png', data: renderField(s, { showZones: true, legend: 'match', hudRight: this.label.toUpperCase() }) };
    this.deadline = Date.now() + this.planSeconds * 1000;
    // até a mensagem nova sair, nenhuma edição pode cair no registro do lance anterior
    this.message = null;
    try {
      this.message = await this.channel.send(screen(this.publicSpec(true)));
    } catch (e) {
      console.error('[partida] falha ao postar o lance', e);
    }
    // o relógio conta a partir do prazo mostrado na mensagem
    const left = Math.max(0, this.deadline - Date.now());
    // sem humanos ativos: resolve direto (todos AFK/bots)
    if (!this.humanSlots().length) {
      this.timer = setTimeout(() => void this.proceed(), 2500);
    } else {
      this.timer = setTimeout(() => void this.proceed(), left);
      this.warnTimer = setTimeout(() => {
        this.warned = true;
        void this.refresh(false);
      }, Math.max(0, left - 10_000));
    }
  }

  draftFor(userId: string): { slotId: string; draft: Draft } {
    const slotId = this.slotOfUser(userId);
    if (!slotId) throw new Error('fora da partida');
    let d = this.drafts.get(userId);
    if (!d) {
      const prev = this.humanPlans[slotId];
      d = prev ? { ...planToDraft(prev), confirmed: true } : newDraft(this.state, slotId);
      this.drafts.set(userId, d);
    }
    return { slotId, draft: d };
  }

  panel(userId: string): ScreenSpec {
    const { slotId, draft } = this.draftFor(userId);
    return panelScreen({ matchId: this.id, state: this.state, slotId, draft, mode: 'plan', deadline: this.deadline });
  }

  /** Clique no painel de planejamento. */
  click(userId: string, action: string, arg: string | undefined, values: string[] | null): ScreenSpec {
    const { slotId, draft } = this.draftFor(userId);
    if (action === 'redo') {
      draft.confirmed = false;
      delete this.humanPlans[slotId];
      this.refreshSoon();
    } else {
      const r = applyClick(this.state, slotId, draft, action, arg, values, { mode: 'plan' });
      if (r === 'confirm') {
        draft.confirmed = true;
        this.humanPlans[slotId] = draftToPlan(slotId, draft);
        this.refreshSoon();
        if (this.humanSlots().every((s) => this.humanPlans[s])) {
          this.clearTimers();
          setTimeout(() => void this.proceed(), 800);
        }
      }
    }
    return panelScreen({ matchId: this.id, state: this.state, slotId, draft, mode: 'plan', deadline: this.deadline });
  }

  // ---------------------------------------------------------------------------
  // Revelação e reação
  // ---------------------------------------------------------------------------

  async proceed() {
    if (this.phase !== 'planning') return;
    this.clearTimers();
    this.phase = 'resolving';
    const humans = this.humanSlots();
    const afk = this.participants.map((p) => p.slotId).filter((s) => !this.humanPlans[s] || !humans.includes(s));
    const overrides = Object.fromEntries(afk.map((s) => [s, AFK_OVERRIDE]));
    const ai = planBots(this.state, [...this.botSlots(), ...afk], overrides);
    this.lastDebug = ai.debug;
    let plans = normalizePlans(this.state, { ...ai.plans, ...Object.fromEntries(Object.entries(this.humanPlans).filter(([s]) => humans.includes(s))) });
    const reqs = getReactionRequests(this.state, plans);
    const rev = publicRevelation(this.state, plans);
    for (const r of reqs) if (!this.isHumanSlot(r.playerId) || afk.includes(r.playerId)) plans = reactBot(this.state, plans, r, rev, overrides[r.playerId]);
    this.pendingPlans = plans;
    this.reactions = reqs.filter((r) => this.isHumanSlot(r.playerId) && !afk.includes(r.playerId));
    this.reactionDone.clear();
    // revelação pública
    const png = renderField(this.state, { arrows: arrowsFromRevelation(this.state, rev), legend: 'match', hudRight: 'REVELAÇÃO', overlays: { reading: rev.filter((a) => a.reading).map((a) => a.dest) } });
    this.lastImage = { name: 'campo.png', data: png };
    if (this.reactions.length) {
      this.phase = 'reaction';
      this.deadline = Date.now() + MATCH_RULES.reactionSeconds * 1000;
      this.lastLog = ['Revelação. Quem tem habilidade de reação pode ajustar o plano agora.'];
      await this.refresh(true);
      this.timer = setTimeout(() => void this.resolveNow(), MATCH_RULES.reactionSeconds * 1000);
    } else {
      this.lastLog = ['Revelação.'];
      await this.refresh(true);
      this.timer = setTimeout(() => void this.resolveNow(), 2500);
    }
  }

  reactionFor(userId: string): { slotId: string; req: ReactionRequest; draft: Draft } | null {
    const slotId = this.slotOfUser(userId);
    if (!slotId) return null;
    const req = this.reactions.find((r) => r.playerId === slotId);
    if (!req) return null;
    let d = this.drafts.get(`rx:${userId}`);
    if (!d) {
      d = planToDraft(this.pendingPlans[slotId]);
      if (this.reactionDone.has(slotId)) d.confirmed = true;
      this.drafts.set(`rx:${userId}`, d);
    }
    return { slotId, req, draft: d };
  }

  reactionPanel(userId: string): ScreenSpec | null {
    const r = this.reactionFor(userId);
    if (!r) return null;
    return panelScreen({ matchId: this.id, state: this.state, slotId: r.slotId, draft: r.draft, mode: 'react', reaction: r.req, deadline: this.deadline });
  }

  reactionClick(userId: string, action: string, arg: string | undefined, values: string[] | null): ScreenSpec | null {
    const r = this.reactionFor(userId);
    if (!r) return null;
    const res = applyClick(this.state, r.slotId, r.draft, action, arg, values, { mode: 'react', reaction: r.req });
    if (res === 'confirm') {
      const cur = this.pendingPlans[r.slotId];
      const next = draftToPlan(r.slotId, r.draft);
      // só o que a habilidade permite muda
      const merged = { ...cur, ...(r.req.allowDest ? { dest: next.dest } : {}), ...(r.req.allowAction ? { action: next.action, targetPlayer: next.targetPlayer, targetCell: next.targetCell, shotZone: next.shotZone, readGuess: next.readGuess } : {}) };
      this.pendingPlans = { ...this.pendingPlans, [r.slotId]: merged };
      r.draft.confirmed = true;
      this.reactionDone.add(r.slotId);
      this.refreshSoon();
      if (this.reactions.every((x) => this.reactionDone.has(x.playerId))) {
        this.clearTimers();
        setTimeout(() => void this.resolveNow(), 600);
      }
    }
    return panelScreen({ matchId: this.id, state: this.state, slotId: r.slotId, draft: r.draft, mode: 'react', reaction: r.req, deadline: this.deadline });
  }

  // ---------------------------------------------------------------------------
  // Resolução
  // ---------------------------------------------------------------------------

  async resolveNow() {
    if (this.phase !== 'reaction' && this.phase !== 'resolving') return;
    this.clearTimers();
    this.phase = 'resolving';
    const prev = this.state;
    let result: TurnResult;
    try {
      result = resolveTurn(prev, normalizePlans(prev, this.pendingPlans));
    } catch (e) {
      console.error('[partida] erro na resolução', e);
      await abortMatch(this.id, 'erro na resolução');
      this.phase = 'finished';
      this.lastLog = ['A partida foi interrompida por um erro do sistema. Nenhuma recompensa foi aplicada.'];
      await this.refresh(false);
      this.unregister();
      return;
    }
    this.state = result.state;
    this.turns.push(result.plans);
    let gif: Buffer | null = null;
    if (this.gifEnabled) {
      try {
        gif = renderStepsGif(prev, result);
      } catch (e) {
        console.error('[partida] falha no GIF', e);
      }
    }
    this.lastImage = gif
      ? { name: 'lance.gif', data: gif }
      : { name: 'campo.png', data: renderField(this.state, { arrows: arrowsFromResult(prev, result), overlays: overlaysFromResult(prev, result), legend: 'match', hudRight: 'RESULTADO', banner: turnBanner(prev, result) }) };
    this.lastLog = result.log;
    // a mensagem do lance vira o registro do que aconteceu (GIF, narração, sem botões)
    if (this.message) {
      try {
        await this.message.edit(edit(this.recordSpec(prev, result)));
      } catch (e) {
        console.error('[partida] falha ao registrar o lance', e);
      }
    }
    if (this.debugAi) await this.postDebug(prev.turn);
    if (this.state.finished) {
      await saveSnapshot(this.id, this.state, this.turns).catch((e) => console.error('[partida] snapshot', e));
      return this.finish();
    }
    await this.openLance();
    await saveSnapshot(this.id, this.state, this.turns, this.message?.id ?? null).catch((e) => console.error('[partida] snapshot', e));
  }

  private async postDebug(turn: number) {
    const lines: string[] = [`### Depuração da IA · lance ${turn}`];
    for (const t of this.lastDebug) {
      if (!t.bots.length) continue;
      lines.push(`**Time ${t.team}** · plano: ${t.plan}${t.combo ? ` · combo: ${t.combo}` : ''}`);
      for (const b of t.bots) {
        lines.push(`- ${b.name} (${b.role}, ${b.ms} ms)`);
        for (const o of b.options) lines.push(`  - ${o.label} · ${o.score}`);
      }
    }
    const spec: ScreenSpec = { accent: 'aviso', blocks: [text(lines.join('\n').slice(0, 3800))] };
    try {
      // uma só por vez, sempre logo abaixo do lance a que se refere
      await this.debugMessage?.delete().catch(() => {});
      this.debugMessage = await this.channel.send(screen(spec));
    } catch (e) {
      console.error('[debug-ia]', e);
    }
  }

  async finish() {
    this.clearTimers();
    this.phase = 'finished';
    // o último lance já está registrado na própria mensagem; o relatório sai embaixo
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
    this.lastLog = [reason];
    await abortMatch(this.id, reason);
    await this.refresh(false);
    this.unregister();
  }

  leave(userId: string) {
    this.left.add(userId);
    const slot = this.slotOfUser(userId);
    if (slot) delete this.humanPlans[slot];
    sessionByUser.delete(userId);
    this.refreshSoon();
  }

  teamColor(team: 'A' | 'B'): string {
    const s = this.setup.slots.find((x) => x.team === team && !x.isKeeper);
    return s ? (team === 'A' ? s.color : '#F2F4F8') : RARITY_COLORS.comum;
  }

  rarityOf(slotId: string) {
    return getLineage(this.setup.slots.find((s) => s.id === slotId)!.lineageId).rarity;
  }
}
