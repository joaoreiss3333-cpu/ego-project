import { randomBytes } from 'node:crypto';
import { ENERGY, LINEAGES, TRAINING_REWARDS } from '@ego/content';
import {
  PHYSICAL,
  canUsePace,
  newDuelTraining,
  newPhysicalTraining,
  playDuelTraining,
  playPhysical,
  roundsSaved,
  type DuelTrainingState,
  type Pace,
  type PhysicalState,
} from '@ego/engine';
import { effectiveAttrs, finishTraining, prisma, refundEnergy, spendEnergy, type Character } from '@ego/db';
import { renderDuelTraining, renderPhysical } from '@ego/render';
import { busyReason } from '../match/lobby';
import { startMatch } from '../match/start';
import { rewardLine } from '../match/finish';
import { cid, on } from '../router';
import { ButtonStyle, btn, edit, file, images, row, screen, text, type ScreenSpec } from '../ui';
import { replyError } from '../util/reply';
import { assertOwner, ownCharacter } from './common';

interface Session {
  owner: string;
  character: Character;
  duel?: DuelTrainingState;
  phys?: PhysicalState;
  at: number;
}

const active = new Map<string, Session>();

setInterval(() => {
  // treinos abandonados expiram em 10 min
  for (const [k, s] of active) if (Date.now() - s.at > 10 * 60_000) active.delete(k);
}, 60_000).unref();

function duelScreen(s: Session): ScreenSpec {
  const d = s.duel!;
  const png = renderDuelTraining(d);
  const opts = d.kind === 'drible' ? (['driblar', 'proteger', 'passar'] as const) : (['bote', 'conter', 'fechar_linha'] as const);
  const labels: Record<string, string> = { driblar: 'Driblar', proteger: 'Proteger', passar: 'Passar', bote: 'Bote', conter: 'Conter', fechar_linha: 'Fechar linha' };
  // o que vence o quê (matriz de duelo do motor)
  const help =
    d.kind === 'drible'
      ? [
          'Você está com a bola e o defensor escolhe em segredo. Escolha a sua jogada:',
          '-# **Driblar** vence Bote e Fechar linha · perde para Conter',
          '-# **Proteger** (usa Físico) vence Conter e Fechar linha · empata com Bote',
          '-# **Passar** (usa Passe) vence Bote · perde para Fechar linha',
          '-# Empate no dado é da defesa.',
        ]
      : [
          'Você defende e o atacante escolhe em segredo. Escolha a sua defesa:',
          '-# **Bote** empata com Proteger · perde para Driblar e Passar',
          '-# **Conter** vence Driblar · perde para Proteger',
          '-# **Fechar linha** vence Passar · perde para Driblar e Proteger',
          '-# Empate no dado é seu.',
        ];
  return {
    accent: 'padrao',
    files: [file(png, 'treino.png')],
    blocks: [
      text(`### Treino de ${d.kind === 'drible' ? 'drible' : 'desarme'} · rodada ${d.round}/5`),
      images('treino.png'),
      text(help.join('\n')),
      row(...opts.map((o) => btn(cid('tr', 'duel', s.owner, o), labels[o], ButtonStyle.Primary))),
    ],
  };
}

function physScreen(s: Session): ScreenSpec {
  const p = s.phys!;
  const png = renderPhysical(p);
  return {
    accent: 'padrao',
    files: [file(png, 'treino.png')],
    blocks: [
      text(`### Treino físico · rodada ${p.round}/5\nChegue a **${PHYSICAL.trackLength}** de distância em 5 rodadas. Fôlego **${p.stamina}**.`),
      images('treino.png'),
      text(
        [
          '**1.** Escolha a faixa (obstáculos em âmbar). **2.** Escolha o ritmo: a rodada acontece na hora.',
          `-# **Sprint** anda ${PHYSICAL.pace.sprint.advance} (+1 com Velocidade 7+) e gasta ${PHYSICAL.pace.sprint.cost} de fôlego · **Ritmo** anda ${PHYSICAL.pace.ritmo.advance} e gasta ${PHYSICAL.pace.ritmo.cost} · **Poupar** anda ${PHYSICAL.pace.poupar.advance} e recupera ${-PHYSICAL.pace.poupar.cost}`,
          '-# Obstáculo na faixa: teste de Físico. Passou, anda 1 a menos. Falhou, anda só 1.',
        ].join('\n'),
      ),
      row(...[0, 1, 2].map((l) => btn(cid('tr', 'lane', s.owner, l), `Faixa ${l + 1}${p.lane === l ? ' (atual)' : ''}`, p.lane === l ? ButtonStyle.Primary : ButtonStyle.Secondary))),
      row(
        ...(['sprint', 'ritmo', 'poupar'] as Pace[]).map((pc) =>
          btn(cid('tr', 'pace', s.owner, pc), pc === 'sprint' ? 'Sprint' : pc === 'ritmo' ? 'Ritmo' : 'Poupar', ButtonStyle.Success, !canUsePace(p, pc)),
        ),
      ),
    ],
  };
}

async function finishScreen(s: Session): Promise<ScreenSpec> {
  active.delete(s.owner);
  let outcome;
  let files: ReturnType<typeof file>[] = [];
  if (s.duel) {
    outcome = { kind: s.duel.kind, hits: s.duel.hits } as const;
    files = [file(renderDuelTraining(s.duel), 'treino.png')];
  } else {
    outcome = { kind: 'fisico', finished: s.phys!.completed, roundsSaved: roundsSaved(s.phys!) } as const;
    files = [file(renderPhysical(s.phys!), 'treino.png')];
  }
  const { reward, missions } = await finishTraining(s.character.id, outcome);
  const head = s.duel ? `${s.duel.hits}/5 acertos.` : s.phys!.completed ? `Chegou em ${s.phys!.history.length} rodadas.` : 'Não chegou ao fim.';
  const extra = missions.completed.map((m) => `-# Missão concluída: ${m.mission.name}.`).join('\n');
  return {
    accent: 'sucesso',
    files,
    blocks: [text(`### Avaliação concluída\n${head}`), images('treino.png'), text(`${rewardLine(reward)}${extra ? `\n${extra}` : ''}`)],
  };
}

on.command('treino', async (i) => {
  const sub = i.options.getSubcommand();
  const c = await ownCharacter(i.user.id);
  if (sub === '1v1') {
    if (!c.lineageId) return replyError(i, 'Você ainda não tem linhagem. Faça seu giro gratuito com /girar.');
    const busy = busyReason(i.user.id);
    if (busy) return replyError(i, busy);
    if (!i.guildId || !i.channel?.isSendable()) return replyError(i, 'Use este comando em um canal de texto do servidor.');
    await spendEnergy(c.id);
    const opp = LINEAGES[Math.floor(Math.random() * LINEAGES.length)];
    await i.reply(screen({ accent: 'padrao', blocks: [text(`### Treino 1v1\nContra um bot ${opp.name}. Primeiro a 2 gols ou 6 lances.`)] }, { ephemeral: true }));
    try {
      await startMatch({
        guildId: i.guildId,
        channel: i.channel,
        mode: '1v1',
        kind: 'treino',
        teamA: [{ userId: i.user.id, character: c }],
        teamB: [],
        botsB: [{ name: `Sparring ${opp.name}`, lineageId: opp.id, level: c.level, personality: 'coletivo', position: 'atacante' }],
        botDifficultyB: c.level < 8 ? 'novato' : 'regular',
        rules: { turnsPerHalf: 6, halves: 1, firstTo: 2 },
        label: 'Treino 1v1',
      });
    } catch (e) {
      await refundEnergy(c.id);
      throw e;
    }
    return;
  }
  if (active.has(i.user.id)) return replyError(i, 'Você já tem um treino em andamento. Termine ou espere expirar.');
  const e = await spendEnergy(c.id);
  const items = await prisma.inventoryItem.findMany({ where: { characterId: c.id } });
  const attrs = effectiveAttrs(c, items);
  const s: Session = { owner: i.user.id, character: c, at: Date.now() };
  const seed = randomBytes(8).toString('hex');
  if (sub === 'drible' || sub === 'desarme') s.duel = newDuelTraining(sub, seed, attrs, c.level);
  else s.phys = newPhysicalTraining(seed, attrs);
  active.set(i.user.id, s);
  const spec = s.duel ? duelScreen(s) : physScreen(s);
  spec.blocks.push(text(`-# Energia: ${e.energy}/${ENERGY.max}. Recompensa: fichas de ${sub === 'drible' ? 'Drible' : sub === 'desarme' ? 'Defesa' : 'Velocidade e Físico'} (${sub === 'fisico' ? `${TRAINING_REWARDS.fisico.tokensBase}+` : `${TRAINING_REWARDS.drible.tokensPerHit} por acerto`}).`));
  await i.reply(screen(spec, { ephemeral: true }));
});

on.component('tr', async (i, [action, owner, arg]) => {
  assertOwner(i, owner);
  const s = active.get(owner);
  if (!s) return replyError(i, 'Esse treino expirou. Comece outro com /treino.');
  s.at = Date.now();
  if (action === 'duel' && s.duel) {
    s.duel = playDuelTraining(s.duel, arg);
    if (s.duel.finished) return i.update(edit(await finishScreen(s)));
    return i.update(edit(duelScreen(s)));
  }
  if (action === 'lane' && s.phys) {
    s.phys = { ...s.phys, lane: Number(arg) };
    return i.update(edit(physScreen(s)));
  }
  if (action === 'pace' && s.phys) {
    s.phys = playPhysical(s.phys, s.phys.lane, arg as Pace);
    if (s.phys.finished) return i.update(edit(await finishScreen(s)));
    return i.update(edit(physScreen(s)));
  }
});
