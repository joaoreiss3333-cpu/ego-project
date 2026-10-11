import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { GUIDES, MATCH_MODES } from '@ego/content';

const modeChoices = MATCH_MODES.map((m) => ({ name: m, value: m }));

export const COMMANDS = [
  new SlashCommandBuilder().setName('criar-personagem').setDescription('Crie seu personagem e entre na instalação.'),
  new SlashCommandBuilder().setName('tutorial').setDescription('Aprenda a jogar: explicações rápidas e treinos práticos (grátis).'),
  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Sua ficha de avaliação (ou a de outro jogador).')
    .addUserOption((o) => o.setName('usuario').setDescription('Jogador').setRequired(false)),
  new SlashCommandBuilder().setName('atributos').setDescription('Distribua seus Pontos de Atributo.'),
  new SlashCommandBuilder().setName('loadout').setDescription('Veja seu loadout de habilidades.'),
  new SlashCommandBuilder()
    .setName('guia')
    .setDescription('Abra um guia no site.')
    .addStringOption((o) =>
      o
        .setName('tema')
        .setDescription('Tema do guia')
        .setRequired(false)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName('partida')
    .setDescription('Partidas entre jogadores.')
    .addSubcommand((s) =>
      s
        .setName('criar')
        .setDescription('Abre um lobby de partida neste canal.')
        .addStringOption((o) => o.setName('modo').setDescription('Tamanho dos times').setRequired(true).addChoices(...modeChoices))
        .addStringOption((o) =>
          o
            .setName('tipo')
            .setDescription('Casual ou ranqueada')
            .setRequired(true)
            .addChoices({ name: 'casual', value: 'casual' }, { name: 'ranqueada', value: 'ranqueada' }),
        ),
    )
    .addSubcommand((s) => s.setName('sair').setDescription('Sai do lobby ou da partida em que você está.')),
  new SlashCommandBuilder()
    .setName('fila')
    .setDescription('Fila ranqueada.')
    .addSubcommand((s) =>
      s
        .setName('ranqueada')
        .setDescription('Entra na fila ranqueada.')
        .addStringOption((o) => o.setName('modo').setDescription('Tamanho dos times').setRequired(true).addChoices(...modeChoices)),
    )
    .addSubcommand((s) => s.setName('sair').setDescription('Sai da fila.')),
  new SlashCommandBuilder()
    .setName('treino')
    .setDescription('Treinos rápidos (custam 1 de energia).')
    .addSubcommand((s) => s.setName('drible').setDescription('5 rodadas de drible contra um defensor.'))
    .addSubcommand((s) => s.setName('desarme').setDescription('5 rodadas de desarme contra um atacante.'))
    .addSubcommand((s) => s.setName('fisico').setDescription('Corrida em 3 faixas com obstáculos.'))
    .addSubcommand((s) => s.setName('1v1').setDescription('Mini partida contra um bot: primeiro a 2 gols ou 6 lances.')),
  new SlashCommandBuilder().setName('selecao').setDescription('Modo Seleção: avaliações contra times da instalação.'),
  new SlashCommandBuilder().setName('missoes').setDescription('Missões diárias, semanais e de Despertar.'),
  new SlashCommandBuilder().setName('girar').setDescription('Giro de linhagem.'),
  new SlashCommandBuilder().setName('inventario').setDescription('Equipamentos, cosméticos e materiais.'),
  new SlashCommandBuilder().setName('equipar').setDescription('Equipe itens e cosméticos.'),
  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Ranking do servidor.')
    .addStringOption((o) =>
      o
        .setName('modo')
        .setDescription('Grupo')
        .setRequired(false)
        .addChoices({ name: 'Solo (1v1 e 2v2)', value: 'solo' }, { name: 'Time (3v3 a 5v5)', value: 'time' }),
    ),
  new SlashCommandBuilder().setName('site').setDescription('Link do site com login.'),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Comandos de gerência.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('dar-coins')
        .setDescription('Dá Blue Lock Coins a um jogador.')
        .addUserOption((o) => o.setName('usuario').setDescription('Jogador').setRequired(true))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade (negativo remove)').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('dar-ienes')
        .setDescription('Dá Ienes a um jogador.')
        .addUserOption((o) => o.setName('usuario').setDescription('Jogador').setRequired(true))
        .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade (negativo remove)').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('debug-ia').setDescription('Liga ou desliga a depuração da IA na partida deste canal.'))
    .addSubcommand((s) =>
      s
        .setName('resetar-personagem')
        .setDescription('Apaga o personagem de um jogador.')
        .addUserOption((o) => o.setName('usuario').setDescription('Jogador').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('encerrar-partida').setDescription('Encerra a partida deste canal sem recompensas.'))
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Configurações do servidor.')
        .addIntegerOption((o) => o.setName('tempo-do-lance').setDescription('Segundos de planejamento (20 a 60)').setRequired(false).setMinValue(20).setMaxValue(60))
        .addBooleanOption((o) => o.setName('gif').setDescription('GIF dos passos ligado').setRequired(false))
        .addStringOption((o) => o.setName('modo').setDescription('Modo para o orçamento').setRequired(false).addChoices(...modeChoices))
        .addIntegerOption((o) => o.setName('orcamento').setDescription('Teto de raridade do modo').setRequired(false).setMinValue(1).setMaxValue(50)),
    ),
];

export const GUIDE_CHOICES = GUIDES.map((g) => ({ name: g.title, value: g.slug }));
