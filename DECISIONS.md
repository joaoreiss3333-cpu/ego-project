# Decisões

Pontos em que a especificação estava aberta ou ambígua, e o que foi escolhido. Números de balanceamento ficam em `packages/content`; aqui está só o porquê.

## Stack

- **Versões fixadas** em majors maduras: TypeScript 5.9, Prisma 6.19, Next.js 15.5, React 19.1, Vitest 3.2, Auth.js (`next-auth@5` beta), discord.js 14.27, `@napi-rs/canvas` 0.1.100. Já existem majors mais novas (TS 7, Prisma 7, Vitest 5, Next 16), mas com mudanças de configuração que não valiam o risco na v1.
- **Pacotes internos sem build**: cada pacote exporta o TypeScript direto (`main: src/index.ts`). O bot roda com `tsx`; o site usa `transpilePackages`.
- **Camada de serviços em `packages/db/src/services`**: toda regra que mexe no banco (distribuir atributo, comprar nó, giro, recompensa, fechamento de partida) mora aqui. Bot e site chamam as mesmas funções. O cliente nunca decide recompensa.
- **Nome e moedas** configurados só em `packages/content/src/config.ts` (`GAME`).
- **Fontes** (todas OFL, em `assets/fonts` e no Google Fonts do site): Anton (display, números), Barlow / Barlow Condensed (texto), IBM Plex Mono (dados).

## Motor

- **Determinismo**: o estado da partida carrega o estado do RNG (sfc32). `resolveTurn(estado, planos)` é pura. A IA usa um RNG separado derivado de `seed + lance + jogador`, então decisões de bot também se repetem, sem mexer no RNG da partida. O replay usa os planos finais salvos por lance.
- **Ordem dentro do lance**: ativação de habilidades e custos → iniciativa → Leitura → duelos do passo 0 → passos de movimento (duelos checados a cada passo) → quem usou Arranque Tardio anda por último → ação de bola (passe, tabela, chute) → bola solta na área → fim do lance.
- **Passe e chute acontecem depois do movimento**: o portador anda até o destino (como Conduzir, parando na borda de zonas) e passa/chuta de lá.
- **Passe no pé**: chega na posição final do aliado. **Passe torto**: se `Passe + d10 + modificadores` ficar abaixo de 7, a bola desvia 1 casa (2 se muito ruim). Saindo do campo, vai para o adversário de linha mais próximo, na casa de borda.
- **Penalidade de distância do passe**: -1 para cada 3 casas (ou fração) acima de `Passe / 2`. Arredonda para cima, para qualquer excesso custar algo.
- **Chute**: distância medida até a casa de gol mais próxima, -1 a cada 2 casas (ou fração) acima de 4. **Adicionado: ângulo fechado**, -1 por linha fora da faixa do gol (`anglePenaltyPerRow`). Sem isso, chutar do canto da linha de fundo valia o mesmo que do meio e a IA corria para os cantos.
- **Chute de primeira** (`finalizar_primeira`): ação sem bola. Se receber o passe no lance, chuta na hora na zona escolhida. É a base do Chute Direto e da Peça que Encaixa, e conta para a missão de Despertar do Isagi.
- **Gatilho de duelo**: o portador duela com cada defensor (uma vez por lance) quando está na zona dele e: o portador escolheu Driblar, ou o defensor escolheu Bote ou Conter. Conduzir para na borda; se já começa dentro da zona, só duela com quem der Bote/Conter.
- **Matriz de duelo**: "defesa +2" em Proteger × Bote é bônus do defensor. Proteger também dá +2 ao portador, então Proteger × Bote fica neutro e Proteger × Conter favorece o portador. Duelo de portador que passa usa Passe; que chuta, Chute; que conduz, Drible (sem bônus de matriz).
- **Quem vence o duelo como defensor** fica com a bola. Defensor que perde após Bote fica vendido (sem movimento no próximo lance).
- **Área do goleiro**: 2 colunas de profundidade e as linhas do gol mais 1 para cada lado.
- **Goleiro humano**: escolhe a zona que cobre em todo planejamento (vale se houver chute). Adiantar linha: intercepta passes perto dele com +2 e defende chutes com -1. Comandar: +1 de Defesa a um aliado na área. Sair do gol: disputa bola solta na área com +3.
- **Chute defendido** fica com o goleiro. Gol reinicia no centro com a posse de quem sofreu. O segundo tempo começa com o time B.
- **Partida rápida**: primeiro a 3 gols, com teto de 2 tempos de 15 lances.
- **Recarga**: guardada como "lance em que volta a ficar disponível". Recarga 2 usada no lance 5 volta no lance 8.

## Revelação e janela de reação

A especificação pede planejamento simultâneo, revelação com setas e depois resolução, e várias habilidades agem "antes da resolução" ou "depois da revelação".

- **Revelação pública**: mostra o destino de cada jogador (seta), a categoria da seta (ataque, apoio, defesa, goleiro), quem usou habilidade ou Flow e quem está em Leitura (postura visível). **Continua secreto**: a ação exata, o alvo do passe, a zona do chute, a zona do goleiro e o palpite da Leitura.
- **Janela de reação** (15 s, só se alguém tiver habilidade de reação ativa): Leitura Espacial, Metavisão, Instinto Animal, Ego Desperto, Ginga Perfeita, Improviso e Arranque Tardio. Cada uma revela o que diz no texto e libera a mudança correspondente. Bots reagem usando só o que a habilidade revelou.
- **Leitura Espacial**: como os destinos já são públicos, ela revela o plano completo (destino e ação) do adversário mais próximo e permite trocar o próprio destino.
- **Metavisão**: permite reescrever destino e ação.
- **Instinto Animal**: permite refazer o plano (destino e ação).
- **Arranque Tardio**: o jogador escolhe o destino na janela de reação, vendo todos os destinos, e anda por último, depois de todos, com metade do movimento. (Escolher depois da resolução real exigiria pausar a resolução no meio.)
- **Ego Desperto** e **Ginga Perfeita** valem nos lances seguintes também enquanto durarem.

## Habilidades

- Custos de fôlego e recargas que a especificação não deu foram definidos no conteúdo (ex.: Carrinho 10, Cobertura 10, Corpo Elástico 15). Todos estão em `packages/content/src/lineages`.
- **Habilidades que "armam"** (Corpo Elástico, Cobertura, Carrinho, Chute Direto, Chute em Velocidade, Passe em Curva, Samba Livre) pagam custo e recarga ao serem escolhidas; a maestria só conta quando o efeito acontece.
- **Cobertura**: se o aliado perder o duelo e Kuon estiver a até 2 casas do portador, Kuon duela com +2.
- **Faixa de Aceleração**: vale se o destino estiver em linha reta a 4+ casas. A trilha protege passes que terminam nela no mesmo lance (Faixa II: também no seguinte).
- **Peça que Encaixa**: a casa marcada é o destino do Isagi; o plano dele precisa ser Chute de primeira. Também dispara se a bola sobrar solta na casa.
- **Devorar**: copia a última habilidade ativa do adversário que duelou com Isagi no lance anterior. A cópia precisa ser válida na situação (ex.: Carrinho exige estar defendendo).
- **Ritmo**: os acúmulos pertencem ao jogador. Com o máximo, a próxima ação de bola (qualquer uma, exceto Proteger) não sofre duelo, interceptação nem conta para Leitura, e zera os acúmulos.
- **Maestria**: -2 de fôlego por nível; nível III muda o visual da seta; nível V põe o sufixo "— Maestria" no log.

## Personagem e progressão

- **Sem linhagem** (antes do giro gratuito) o teto de todos os atributos é 6 e não dá para jogar partidas. O primeiro giro de quem não tem linhagem é aceito direto (não faz sentido descartar e ficar sem nenhuma).
- **Pontos**: nível N tem N-1 Pontos de Atributo ganhos e 1 Ponto de Linhagem por nível par.
- **Resets**: atributos devolvem pontos e as fichas gastas; árvore devolve os Pontos de Linhagem da linhagem equipada e volta o loadout ao padrão. Custo e recarga de 24 h em `PROGRESSION.reset`.
- **Equipamentos**: bônus +1/+2/+3 nos níveis +0/+1/+2. O atributo final nunca passa do teto em mais de 1 (pode chegar a 11 com teto 10).
- **Molduras de raridade**: liberadas para quem já obteve uma linhagem daquela raridade (não para todos), para manterem significado.
- **Missões** usam dia e semana no horário de Brasília (UTC-3). O sorteio das 3 diárias e 3 semanais é determinístico por personagem e período.
- **Personagem por usuário**: um personagem por conta do Discord, preso ao servidor em que foi criado (ranking é por servidor).

## Partidas e recompensas

- **Recompensa de partida** vale para casual e ranqueada. No Modo Seleção vale a recompensa da etapa. Treino 1v1 dá a recompensa de treino.
- **Fichas de partidas**: Passe (passes certos e assistências, até 12), mais 1 de Drible a cada 2 dribles vencidos e 1 de Defesa a cada 2 desarmes.
- **Travas**: as multiplicações se acumulam (atividade baixa × retorno decrescente × grupo repetido). Blue Lock Coins nunca são multiplicadas (só vêm de missões e admin).
- **Entregar o jogo**: um lado humano inteiro sem nenhuma ação própria na partida. Não conta MMR e a partida fica marcada (`flagged`) para revisão.
- **MMR**: Elo pela média de cada time, K = 32. Bots não entram na média.
- **Chefe do Modo Seleção**: a primeira vitória contra um chefe entrega a Caneleira Reforçada; repetições têm chance de drop.

## IA

- **Coordenação dentro do time**: o portador bot decide primeiro e os companheiros bots jogam em cima do plano dele (é informação do próprio time). A IA nunca recebe os planos dos humanos: `planTeam` só recebe o estado público.
- **Leitura do adversário**: vem só do histórico revelado depois de cada lance. Tendências recentes pesam mais no Elite e no Chefe.
- **Dificuldades** diferem em temperatura (Novato 4,5 · Regular 2,5 · Elite 1,0 · Chefe 0,15), janela de "erro plausível", combos permitidos, leitura e uso de habilidades. Medido em simulação: Elite vence Regular e Chefe vence Elite (testes em `packages/engine/test/ai.test.ts`).
- **Combos** entram como uma opção a mais, avaliada pela jogada real mais um bônus pequeno de coordenação. Um bônus fixo alto deixava os bots piores (medido).
- Foi testada uma "antecipação" do movimento adversário para o Chefe; piorou o desempenho em 2v2 e foi removida.

## Bot (Discord)

- **Destino no painel de planejamento**: a imagem numera todas as casas alcançáveis e o destino é escolhido em menus de seleção numerados (até 25 casas por menu, no máximo 4 menus), não em botões. Com alcance 2 já são 25 casas, e o limite de 40 componentes por mensagem não comporta um botão por casa. Continua sendo um clique.
- **Cliques do plano**: destino (menu) → ação (botão) → alvo quando a ação pede (aliado, adversário, casa do passe no espaço, zona do chute ou palpite da Leitura) → Confirmar. Sprint, habilidades (com custo e recarga no botão) e Flow ficam numa fileira própria. O goleiro humano escolhe a zona que cobre no próprio painel.
- **Resumo antes de confirmar** e botão "Refazer plano" até o fim do planejamento.
- **Mensagem pública**: uma por partida, editada a cada fase (planejamento, revelação, reação, resultado). O tempo restante usa o timestamp relativo do Discord (conta sozinho); a cor fica âmbar nos últimos 10 segundos. Edições de status têm debounce para não bater no limite de edição do Discord.
- **Revelação → resolução**: sem janela de reação humana, a revelação fica 2,5 s na tela antes da resolução.
- **AFK**: quem não confirma a tempo é jogado pela IA naquele lance (Regular, Cauteloso, sem gastar Flow). `/partida sair` no meio da partida entrega a vaga à IA até o fim.
- **Lobby**: casual inicia com vagas vazias preenchidas por bots; ranqueada exige os dois times completos com jogadores (goleiros podem ser bots). O orçamento de raridade conta os jogadores de linha e o goleiro humano do time. O host escolhe o formato (2 tempos ou rápida).
- **Fila ranqueada**: em memória, por servidor e modo. Casa grupos com MMR dentro de uma faixa que abre com o tempo (`MMR.queueInitialRange` e `queueRangeGrowthPerMinute`), dividindo os times para a menor diferença de MMR que respeite o orçamento.
- **Treinos de drible, desarme e físico** são efêmeros (só o jogador vê). O treino 1v1 é uma partida real no canal, com a mesma interface das partidas.
- **Um jogador por vez**: não dá para estar em dois lobbies, duas partidas ou lobby e fila ao mesmo tempo.
- **Retomada**: ao reiniciar, cada partida em andamento continua do último lance salvo, com uma mensagem nova no mesmo canal (a antiga fica como estava).
- **Depuração da IA** (`/admin debug-ia`): liga por partida (a do canal) e mantém uma mensagem separada, atualizada a cada lance.
- **Limite de uso**: 6 comandos a cada 10 s por usuário (`ANTI_ABUSE.rateLimit`); cliques em botões têm limite 4 vezes maior.

## Simulação

- A simulação (`pnpm simulate`) usa bots Elite de nível 20 com a árvore comprada até o equivalente ao nível 30 (inclui Despertares), loadout de 3 ativas sorteado entre as desbloqueadas e Flow sorteado, para que todas as habilidades apareçam no relatório.
- Ela não muda nenhum número: os achados ficam em `BALANCE.md`.
