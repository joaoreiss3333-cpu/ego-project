import {
  ACTION_LABEL,
  ANTI_ABUSE,
  ATTR_LABEL,
  DAILY_MISSIONS,
  DIFFICULTY_LABEL,
  ENERGY,
  GAME,
  MARKET_VALUE,
  MATCH_REWARDS,
  MATCH_RULES as R,
  MISSION_COIN_BONUS,
  SELECTION_GROUPS,
  TRAINING_REWARDS,
  WEEKLY_MISSIONS,
  getEquipment,
  getLineage,
  findCosmetic,
  type Attrs,
} from '@ego/content';
import { PHYSICAL, TRAINING_ROUNDS, duelMatrix, hintAccuracy, newDuelTraining, newPhysicalTraining, playPhysical } from '@ego/engine';
import { pct } from '@/lib/format';
import { rewardText } from '@/lib/rewards';
import { HBars, Track } from '../figures';
import { sampleReward } from '../data';
import type { GuideDoc } from '../types';

const baseAttrs: Attrs = { velocidade: 5, drible: 5, passe: 5, chute: 5, fisico: 5, visao: 5, defesa: 5 };

/** Força do bot dos treinos de duelo por nível (lida da função do motor). */
const botLevels = [1, 5, 10, 15, 20, 30, 40];
const botStat = (level: number) => newDuelTraining('drible', 'guia', baseAttrs, level).botStat;

/** A partir de qual Velocidade o sprint do treino físico rende 1 casa a mais (lido do motor). */
function sprintBonusFrom(): number | null {
  for (let v = 1; v <= 11; v++) {
    const s = newPhysicalTraining('guia', { ...baseAttrs, velocidade: v });
    s.obstacles = [false, false, false];
    const next = playPhysical(s, 1, 'sprint');
    if (next.history[0].advance > PHYSICAL.pace.sprint.advance) return v;
  }
  return null;
}
const sprintVel = sprintBonusFrom();
const firstHint = Array.from({ length: 10 }, (_, i) => i + 1).find((v) => hintAccuracy(v) > 0);

const PACE_LABEL = { sprint: 'Sprint', ritmo: 'Ritmo', poupar: 'Poupar' } as const;

export const treinos: GuideDoc = {
  slug: 'treinos',
  summary: `Treinos são rápidos: até ${TRAINING_ROUNDS} rodadas, só botões. Cada um gasta ${ENERGY.trainingCost} de energia. A energia vai até ${ENERGY.max} e recupera 1 a cada ${ENERGY.regenHours} horas.`,
  sections: [
    {
      title: 'Energia',
      blocks: [
        `Máximo de ${ENERGY.max}. Recupera 1 a cada ${ENERGY.regenHours} horas, até encher. Cheia, ela para de contar: treinar antes de encher não desperdiça recarga.`,
        'Todo treino conta para as missões de treino e dá XP e Ienes além das fichas.',
      ],
    },
    {
      title: 'Treino de drible',
      blocks: [
        `${TRAINING_ROUNDS} rodadas contra um defensor. Você escolhe ${ACTION_LABEL.driblar}, ${ACTION_LABEL.proteger} ou passar; o bot escolhe ${ACTION_LABEL.bote}, ${ACTION_LABEL.conter} ou ${ACTION_LABEL.fechar_linha} em segredo. Vale a matriz de duelo ([[duelos]]).`,
        { list: [`Driblar usa Drible; Proteger usa Físico + ${R.duel.protectBonus}; passar usa Passe.`, `Passar contra ${ACTION_LABEL.fechar_linha}: +${R.duel.matrixBonus} para o bot.`, 'Você vence a rodada se tirar mais que o bot.', `Recompensa: ${TRAINING_REWARDS.drible.tokensPerHit} Fichas de Drible por acerto, ${TRAINING_REWARDS.drible.xp} XP, ${TRAINING_REWARDS.drible.ienes} Ienes.`] },
      ],
    },
    {
      title: 'Treino de desarme',
      blocks: [
        `O contrário: o bot ataca (${ACTION_LABEL.driblar}, ${ACTION_LABEL.proteger} ou passar) e você escolhe ${ACTION_LABEL.bote}, ${ACTION_LABEL.conter} ou ${ACTION_LABEL.fechar_linha}. Você usa Defesa; empate é seu.`,
        `Recompensa: ${TRAINING_REWARDS.desarme.tokensPerHit} Fichas de Defesa por acerto, ${TRAINING_REWARDS.desarme.xp} XP, ${TRAINING_REWARDS.desarme.ienes} Ienes.`,
        { h: 'Força do bot e dicas' },
        { table: { head: ['Seu nível', ...botLevels.map(String)], rows: [['Atributo do bot', ...botLevels.map(botStat)]] } },
        `Com Visão ${firstHint ?? '-'} ou mais, aparece uma dica da escolha do bot. Ela acerta ${pct(hintAccuracy(firstHint ?? 10), 0)} das vezes nesse valor e melhora com mais Visão ([[atributos-e-tetos]]).`,
        'O bot tem uma tendência sorteada no começo do treino. Observe as rodadas.',
      ],
    },
    {
      title: 'Treino físico',
      blocks: [
        `Uma pista de ${PHYSICAL.trackLength} casas em ${PHYSICAL.lanes} faixas. A cada rodada você escolhe a faixa e o ritmo. Toda rodada tem obstáculo em pelo menos uma faixa.`,
        { table: { head: ['Ritmo', 'Avança', 'Fôlego'], rows: (Object.keys(PHYSICAL.pace) as (keyof typeof PHYSICAL.pace)[]).map((p) => [PACE_LABEL[p], PHYSICAL.pace[p].advance, PHYSICAL.pace[p].cost > 0 ? `-${PHYSICAL.pace[p].cost}` : `+${-PHYSICAL.pace[p].cost}`]) } },
        {
          list: [
            `Obstáculo na faixa: Físico + d10 contra ${PHYSICAL.obstacleCheck}. Passou, avança 1 a menos. Falhou, avança só 1.`,
            sprintVel ? `Com Velocidade ${sprintVel} ou mais, o sprint avança 1 casa a mais.` : 'Velocidade alta ajuda no sprint.',
            'Sem fôlego para o ritmo escolhido, você poupa.',
            `Chegou em até ${TRAINING_ROUNDS} rodadas: ${TRAINING_REWARDS.fisico.tokensBase} fichas de Velocidade e de Físico, +${TRAINING_REWARDS.fisico.tokensBonusPerRoundSaved} por rodada que sobrou. Não chegou: metade da base.`,
          ],
        },
      ],
    },
    {
      title: 'Treino 1v1',
      blocks: [
        'Uma mini partida contra um bot, com as regras normais de partida.',
        `Vitória: ${TRAINING_REWARDS['1v1'].xpWin} XP. Derrota: ${TRAINING_REWARDS['1v1'].xpLoss} XP. Sempre ${TRAINING_REWARDS['1v1'].ienes} Ienes, ${TRAINING_REWARDS['1v1'].tokensPerGoal} Fichas de Chute por gol (+1) e ${TRAINING_REWARDS['1v1'].visionTokensBase} de Visão (+1 por jogada de visão).`,
      ],
    },
  ],
  examples: [
    {
      title: 'A pista do treino físico',
      figure: <Track length={PHYSICAL.trackLength} lanes={PHYSICAL.lanes} obstacles={[[3, 0], [3, 2], [7, 1], [10, 0], [11, 2]]} />,
      text: `Com Ritmo (${PHYSICAL.pace.ritmo.advance} casas) em todas as rodadas, você chega em ${Math.ceil(PHYSICAL.trackLength / PHYSICAL.pace.ritmo.advance)} rodadas se não tropeçar. Um sprint bem colocado numa faixa limpa economiza uma rodada.`,
    },
    {
      title: 'Leitura da matriz no treino de drible',
      figure: (
        <HBars
          title="Bônus da matriz por escolha do bot, para quem dribla"
          rows={[
            { label: `Driblar x ${ACTION_LABEL.bote}`, value: duelMatrix('driblar', 'bote')[0], note: 'seu' },
            { label: `Driblar x ${ACTION_LABEL.conter}`, value: duelMatrix('driblar', 'conter')[1], note: 'do bot', color: '#C9D2E3' },
            { label: `Proteger x ${ACTION_LABEL.bote}`, value: duelMatrix('proteger', 'bote')[1], note: 'do bot (+fixo seu)', color: '#C9D2E3' },
            { label: `Passar x ${ACTION_LABEL.fechar_linha}`, value: R.duel.matrixBonus, note: 'do bot', color: '#C9D2E3' },
          ]}
          max={R.duel.matrixBonus * 2}
        />
      ),
      text: 'Se a dica disser Conter, não dribla: proteja ou passe. Se disser Bote, drible.',
    },
  ],
  faq: [
    { q: 'Treino dá Blue Lock Coins?', a: 'Não. Coins vêm de missões e chefes do Modo Seleção.' },
    { q: 'Posso treinar sem energia?', a: 'Não. O bot avisa quanto falta para a próxima recarga.' },
  ],
  related: ['fichas-de-treino', 'missoes', 'duelos'],
};

// ---------------------------------------------------------------------------
const stages = SELECTION_GROUPS.flatMap((g) => g.stages.map((s) => ({ g, s })));

export const modoSelecao: GuideDoc = {
  slug: 'modo-selecao',
  summary: 'O Modo Seleção é a campanha contra times da instalação. As etapas se liberam em ordem. A primeira vitória paga a recompensa cheia; repetir paga menos e pode render equipamento.',
  sections: [
    {
      title: 'Como funciona',
      blocks: [
        { list: ['Cada etapa libera a seguinte, na ordem da lista.', 'O goleiro adversário é sempre bot.', 'Cada etapa tem formato próprio (tempos, lances e, às vezes, primeiro a N gols).', 'As travas diárias das partidas não valem aqui: a recompensa é a da etapa.'] },
        `Repetições pagam a recompensa de repetição e têm chance de drop do equipamento da etapa. A primeira vitória num chefe já entrega o item dele. Concluir todas as etapas de um grupo libera um cosmético.`,
      ],
    },
    ...SELECTION_GROUPS.map((g) => ({
      title: g.name,
      blocks: [
        g.description,
        {
          table: {
            head: ['Etapa', 'Modo', 'Dificuldade', 'Adversários', '1ª vitória', 'Repetição', 'Drop'],
            rows: g.stages.map((s) => [
              s.name,
              s.mode,
              DIFFICULTY_LABEL[s.difficulty],
              s.opponents.map((o) => `${o.name} (${getLineage(o.lineageId).name} nv ${o.level})`).join(', '),
              rewardText(s.firstReward),
              rewardText(s.repeatReward),
              s.dropItem ? `${getEquipment(s.dropItem).name} ${pct(s.dropChance, 0)}` : '—',
            ]),
          },
        },
        ...(g.completionCosmetic ? [`Concluir o grupo libera: **${findCosmetic(g.completionCosmetic)?.name ?? g.completionCosmetic}**.`] : []),
      ],
    })),
  ],
  examples: [
    {
      title: 'Primeira vitória contra repetição',
      figure: (
        <HBars
          title="XP da primeira vitória e da repetição por etapa"
          rows={stages.flatMap(({ s }) => [
            { label: `${s.name} · 1ª`, value: s.firstReward.xp ?? 0 },
            { label: `${s.name} · rep.`, value: s.repeatReward.xp ?? 0, color: '#26385A' },
          ])}
          unit=" XP"
        />
      ),
      text: 'A primeira vitória de cada etapa vale muito mais. Avance antes de farmar.',
    },
  ],
  faq: [
    { q: 'Posso repetir uma etapa já vencida?', a: 'Pode. Paga a recompensa de repetição e tem chance de drop do equipamento da etapa.' },
    { q: 'Perdi. Perco alguma coisa?', a: 'Não. A tentativa fica registrada e você tenta de novo.' },
  ],
  related: ['missoes', 'equipamentos', 'cosmeticos'],
};

// ---------------------------------------------------------------------------
export const missoes: GuideDoc = {
  slug: 'missoes',
  summary: `Todo dia, ${MISSION_COIN_BONUS.dailyCount} missões diárias; toda semana, ${MISSION_COIN_BONUS.weeklyCount} semanais. Fechar todas as do período paga ${GAME.premiumCurrency.plural} extras.`,
  sections: [
    {
      title: 'Como funcionam',
      blocks: [
        { list: ['As missões são sorteadas para você a cada período. O sorteio é fixo por personagem: não dá para trocar.', 'O dia e a semana viram no horário de Brasília (a semana começa na segunda).', 'O progresso conta sozinho nas partidas e treinos. Não precisa aceitar nada.', 'A recompensa entra na hora em que a missão completa.'] },
        `Bônus: fechar as ${MISSION_COIN_BONUS.dailyCount} diárias paga +${MISSION_COIN_BONUS.allDaily} ${GAME.premiumCurrency.short}; fechar as ${MISSION_COIN_BONUS.weeklyCount} semanais paga +${MISSION_COIN_BONUS.allWeekly} ${GAME.premiumCurrency.short}.`,
      ],
    },
    {
      title: 'Diárias possíveis',
      blocks: [{ table: { head: ['Missão', 'Objetivo', 'Recompensa'], rows: DAILY_MISSIONS.map((m) => [m.name, m.description, rewardText(m.reward)]) } }],
    },
    {
      title: 'Semanais possíveis',
      blocks: [{ table: { head: ['Missão', 'Objetivo', 'Recompensa'], rows: WEEKLY_MISSIONS.map((m) => [m.name, m.description, rewardText(m.reward)]) } }],
    },
    {
      title: 'Despertar',
      blocks: ['As missões de Despertar não vencem: ficam abertas até você concluir. Veja [[arvore-e-despertares]].'],
    },
  ],
  examples: [
    {
      title: 'O valor de fechar o dia',
      figure: (
        <HBars
          title="Blue Lock Coins por bônus"
          rows={[
            { label: `${MISSION_COIN_BONUS.dailyCount}/${MISSION_COIN_BONUS.dailyCount} diárias`, value: MISSION_COIN_BONUS.allDaily },
            { label: `${MISSION_COIN_BONUS.weeklyCount}/${MISSION_COIN_BONUS.weeklyCount} semanais`, value: MISSION_COIN_BONUS.allWeekly },
            { label: 'Semana completa', value: MISSION_COIN_BONUS.allDaily * 7 + MISSION_COIN_BONUS.allWeekly, color: '#FFFFFF' },
          ]}
          unit={` ${GAME.premiumCurrency.short}`}
        />
      ),
      text: `Fechando todas as diárias por 7 dias e as semanais, são ${MISSION_COIN_BONUS.allDaily * 7 + MISSION_COIN_BONUS.allWeekly} ${GAME.premiumCurrency.short} só de bônus.`,
    },
  ],
  faq: [
    { q: 'Posso trocar uma missão?', a: 'Não. O sorteio é fixo por personagem e período.' },
    { q: 'Missão de gol conta gol no treino 1v1?', a: 'Conta. Gols do treino 1v1 somam nas missões de gol.' },
  ],
  related: ['recompensas-de-partida', 'modo-selecao', 'treinos'],
};

// ---------------------------------------------------------------------------
const MR = MATCH_REWARDS;
const exStats = { activeTurns: 14, totalTurns: 16, goals: 1, assists: 1, passesCompleted: 5, readsCorrect: 2, duelsWon: 3, dribblesWon: 2 };
const exWin = sampleReward(exStats, true, false, false);
const exRanked = sampleReward(exStats, true, false, true);

export const recompensas: GuideDoc = {
  slug: 'recompensas-de-partida',
  summary: 'Partida casual e ranqueada pagam por participação e por jogada: lances jogados, gols, assistências, leituras, duelos, defesas e o resultado. Tudo calculado no servidor no fim da partida.',
  sections: [
    {
      title: 'Tabela',
      blocks: [
        {
          table: {
            head: ['Evento', 'XP', GAME.commonCurrency.plural],
            rows: [
              ['Lance com ação própria', MR.perActiveTurn.xp, MR.perActiveTurn.ienes],
              ['Gol', MR.goal.xp, MR.goal.ienes],
              ['Assistência', MR.assist.xp, MR.assist.ienes],
              ['Leitura certa', MR.readCorrect.xp, MR.readCorrect.ienes],
              ['Duelo vencido', MR.duelWon.xp, MR.duelWon.ienes],
              ['Defesa (goleiro)', MR.save.xp, MR.save.ienes],
              ['Vitória', MR.win.xp, MR.win.ienes],
              ['Empate', MR.draw.xp, MR.draw.ienes],
            ],
          },
        },
        `Ranqueada multiplica XP e Ienes por ${MR.rankedMultiplier.toLocaleString('pt-BR')}.`,
        `Fichas: ${MR.passTokensPerCompletedPass} de Passe por passe certo e ${MR.assist.passTokens} por assistência (até ${MR.maxPassTokensPerMatch}), mais Drible e Defesa para quem vence vários duelos ([[fichas-de-treino]]).`,
        `${GAME.premiumCurrency.plural} nunca vêm de partida.`,
      ],
    },
    {
      title: 'Outros modos',
      blocks: [{ list: ['Modo Seleção paga a recompensa da etapa ([[modo-selecao]]).', 'Treino paga a recompensa do treino ([[treinos]]).'] }],
    },
    {
      title: 'Valor de mercado',
      blocks: [
        `Cada gol soma ${GAME.commonCurrency.short} ${MARKET_VALUE.goal.toLocaleString('pt-BR')}, cada assistência ${GAME.commonCurrency.short} ${MARKET_VALUE.assist.toLocaleString('pt-BR')} e cada vitória ${GAME.commonCurrency.short} ${MARKET_VALUE.win.toLocaleString('pt-BR')}.`,
        `Depois de ${MARKET_VALUE.inactivityGraceDays} dias sem jogar, o valor exibido cai ${pct(MARKET_VALUE.inactivityDecayPerDay)} por dia, até o piso de ${GAME.commonCurrency.short} ${MARKET_VALUE.floor.toLocaleString('pt-BR')}.`,
      ],
    },
    {
      title: 'Travas',
      blocks: ['Pouca participação, muitas partidas no dia e o mesmo grupo repetido reduzem a recompensa. Veja [[limites-diarios]].'],
    },
  ],
  examples: [
    {
      title: 'Uma vitória boa, casual e ranqueada',
      figure: (
        <HBars
          title="Recompensa da partida de exemplo"
          rows={[
            { label: 'XP casual', value: exWin.xp ?? 0 },
            { label: 'XP ranqueada', value: exRanked.xp ?? 0, color: '#FFFFFF' },
            { label: 'Ienes casual', value: exWin.ienes ?? 0 },
            { label: 'Ienes ranqueada', value: exRanked.ienes ?? 0, color: '#FFFFFF' },
          ]}
        />
      ),
      text: `Vitória com ${exStats.activeTurns} lances jogados, 1 gol, 1 assistência, ${exStats.readsCorrect} leituras certas, ${exStats.duelsWon} duelos vencidos e ${exStats.passesCompleted} passes certos: ${exWin.xp} XP e ${exWin.ienes} Ienes na casual; ${exRanked.xp} XP e ${exRanked.ienes} Ienes na ranqueada. Fichas: ${Object.entries(exWin.tokens ?? {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${v} de ${ATTR_LABEL[k as keyof typeof ATTR_LABEL]}`)
        .join(', ')}. Conta feita pela mesma função que fecha as partidas.`,
    },
  ],
  faq: [
    { q: 'Perder dá recompensa?', a: 'Dá: tudo o que você fez em campo conta. Só o bônus de vitória ou empate fica de fora.' },
    { q: 'Bots contam como adversários de verdade?', a: 'Contam para as recompensas. Não entram na média de MMR.' },
  ],
  related: ['limites-diarios', 'ranking-e-temporadas', 'missoes'],
};

// ---------------------------------------------------------------------------
const tiers = ANTI_ABUSE.dailyTiers.map((t, i, a) => {
  const from = i === 0 ? 1 : a[i - 1].upTo + 1;
  return { label: Number.isFinite(t.upTo) ? `${from}ª a ${t.upTo}ª` : `${from}ª em diante`, m: t.multiplier };
});
const exTier = ANTI_ABUSE.dailyTiers[1] ?? ANTI_ABUSE.dailyTiers[0];
const exMult = exTier.multiplier * ANTI_ABUSE.lowActivityMultiplier;

export const limites: GuideDoc = {
  slug: 'limites-diarios',
  summary: 'A instalação paga quem joga, não quem fica parado. Três travas reduzem a recompensa das partidas casuais e ranqueadas: pouca participação, excesso de partidas no dia e o mesmo grupo repetido.',
  sections: [
    {
      title: 'Participação',
      blocks: [`Se menos de ${pct(ANTI_ABUSE.minActiveRatio, 0)} dos seus lances tiveram ação própria (planejada por você, não pela IA), a recompensa cai para ${pct(ANTI_ABUSE.lowActivityMultiplier, 0)}.`],
    },
    {
      title: 'Retorno decrescente no dia',
      blocks: [
        { table: { head: ['Partida do dia', 'Recompensa'], rows: tiers.map((t) => [t.label, pct(t.m, 0)]) } },
        'O dia vira à meia-noite de Brasília.',
      ],
    },
    {
      title: 'Grupo repetido',
      blocks: [`Com o mesmo grupo de jogadores em menos de ${ANTI_ABUSE.repeatWindowMinutes} minutos, a partir da ${ANTI_ABUSE.repeatFrom}ª partida dentro desse intervalo, a recompensa cai para ${pct(ANTI_ABUSE.repeatMultiplier, 0)}.`],
    },
    {
      title: 'Regras gerais',
      blocks: [
        { list: ['As travas se multiplicam entre si.', `${GAME.premiumCurrency.plural} nunca são reduzidas.`, 'Modo Seleção e treinos não usam essas travas.', 'Um lado humano inteiro sem nenhuma ação própria é tratado como entrega de jogo: a partida não conta MMR e vai para revisão.'] },
        `Comandos: no máximo ${ANTI_ABUSE.rateLimit.maxCommands} a cada ${ANTI_ABUSE.rateLimit.windowSeconds} segundos por pessoa.`,
      ],
    },
  ],
  examples: [
    {
      title: 'Travas somadas',
      figure: (
        <HBars
          title="Multiplicador final"
          rows={[
            { label: 'Normal', value: 100, color: '#FFFFFF' },
            { label: `Partida ${tiers[1]?.label ?? ''}`, value: Math.round(exTier.multiplier * 100) },
            { label: 'Pouca participação', value: Math.round(ANTI_ABUSE.lowActivityMultiplier * 100) },
            { label: 'As duas juntas', value: Math.round(exMult * 100), color: '#FF2E3A' },
          ]}
          max={100}
          unit="%"
        />
      ),
      text: `Uma partida na faixa de ${pct(exTier.multiplier, 0)} do dia, jogada quase toda no automático: ${pct(exTier.multiplier, 0)} x ${pct(ANTI_ABUSE.lowActivityMultiplier, 0)} = ${pct(exMult, 0)} da recompensa.`,
    },
  ],
  faq: [
    { q: 'Cair da conexão conta como ausência?', a: 'Os lances em que a IA jogou por você não contam como ação própria.' },
    { q: 'Treinar com amigos repetidamente é punido?', a: 'Nas partidas casuais e ranqueadas, a partir da repetição indicada. Varie o grupo.' },
  ],
  related: ['recompensas-de-partida', 'estrutura-do-lance'],
};
