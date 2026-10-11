# Regras (versão nova, rascunho)

Futebol tático por turnos individuais. **Cada pessoa joga o seu turno**, a ação resolve na hora e o jogo passa para a próxima pessoa.

Itens marcados com **(proposta)** não foram decididos pelo dono do jogo e podem mudar. Todos os números são iniciais e serão ajustados nos testes e simulações.

## 1. Campo e peças

- Proporções do campo por modo: 1v1, 2v2 e 3v3 em **11×7**; 4v4 em **13×8**; 5v5 em **15×9**.
- Todo movimento e toda ação de contato é **ortogonal** (cima, baixo, esquerda, direita). **Não existe diagonal.**
- "Colado" quer dizer a 1 casa de distância, em linha reta (nunca na diagonal).

## 2. Turnos

- A ordem é a da **entrada na partida**, **intercalando os times** (A1, B1, A2, B2…). Goleiros entram na ordem como os demais.
- No seu turno você escolhe **uma única ação**. Ela resolve imediatamente e o campo muda antes do próximo turno.
- Uma **rodada** é todo mundo jogar uma vez.
- Tempo por turno: **25 s** para jogadores de linha e **15 s** para goleiros **(proposta)**. Quem não jogar a tempo **só perde a vez**: o jogo passa para a próxima pessoa e nada é feito por ela (o goleiro mantém a postura que já tinha).
- Partida: **2 tempos de 6 rodadas** ou primeiro a 3 gols **(proposta)**.

## 3. Dados

Todo conflito é **atributo + d10 + bônus** de cada lado. **O maior vence.**

**Empate estagna o lance:** nada acontece e ninguém perde nada. Quem agiu gastou o turno, mas a bola e as peças ficam como estavam (as exceções estão em cada regra).

Atributos: Velocidade, Drible, Passe, Chute, **Físico**, **Visão** e Defesa.

### Visão (leitura de jogo)
Visão não é um duelo: é um **bônus fixo de ⌊Visão ÷ 3⌋** (Visão 3 a 5 = +1, 6 a 8 = +2, 9 e 10 = +3) em duas situações **(proposta)**:
- **Passes difíceis:** soma na precisão do **Longo**, da **Profundidade** e do **Cruzamento**. O jogador enxerga o espaço melhor.
- **Interceptar:** soma na rolagem de quem **corta um passe** (marcador no caminho do passe curto ou da profundidade, goleiro em Adiantar linha). O jogador lê a linha de passe.

## 4. Sem a bola (uma ação)

| Ação | Regra |
|---|---|
| **Mover** | até 2 casas |
| **Bote** | contra o portador, colado |
| **Carrinho** | como o Bote, mais forte e mais arriscado |
| **Conter** | contra um adversário colado, sem tentar roubar |

### Bote e Carrinho
- Quem age: **Defesa + d10 + 1 por cada outro marcador colado no portador** (cobertura). O **Carrinho** soma **+3**.
- Quem defende: **Físico + d10** do portador (é o Físico que protege a bola).
- **Se você ganhar:** rouba a bola.
- **Empate:** nada acontece. O portador continua com a bola e você gastou o turno.
- **Se você perder:** pode ser **falta**. A falta só existe quando você **perde**.
  - Chance de falta ao perder: **Bote 20%** e **Carrinho 50%** (um d10 de conferência) **(proposta)**.
  - Dada a falta, chance de **cartão amarelo**: **Bote 10%** e **Carrinho 40%** **(proposta)**.
  - **Dois amarelos = expulsão.** O expulso sai da partida e o time joga com um a menos. Em 1v1 vira "fora por 3 rodadas" **(proposta)**.
- **Falta = tiro livre.** O jogador que sofreu a falta **joga de novo na hora**, e os adversários colados dele **recuam 1 casa**. Na grande área, é **pênalti**.
- **Cobrança de falta**, no turno extra:
  - **Direta:** usa o **Chute**, com a regra normal de chute (seção 7). Quanto mais longe do gol, maior a penalidade de distância (grátis até 4 casas, depois −1 a cada 2). Não há penalidade de marcador colado.
  - **Passe:** qualquer um dos 4 passes (curto, longo, profundidade ou cruzamento), com as regras normais.
- Carrinho perdido sem falta: você fica **caído** e **não se move no seu próximo turno** **(proposta)**.

### Conter
- Alvo: um adversário colado (portador ou não).
- Rolagem: **Defesa + d10** contra **Físico + d10** do alvo.
- **Empate:** nada acontece.
- Se você vencer, **todas as rolagens da próxima ação dele recebem −2** (drible, passe, chute…). **−3** se ele for o portador **(proposta)**.
- Sem risco de falta. Não rouba a bola.

## 5. Com a bola (uma ação)

| Ação | Regra |
|---|---|
| **Mover** | 1 casa |
| **Driblar** | adversário colado e a casa logo atrás dele livre. Você **salta por cima** (2 casas). **Drible + d10** contra **Defesa + d10 + cobertura** (+1 por cada outro marcador colado em você). Ganhou: cai atrás dele com a bola. Perdeu: ele fica com ela. **Empate:** ninguém passa, nada muda (você gastou o turno). |
| **Passar** | seção 6 |
| **Chutar** | seção 7 |

## 6. Passes

Precisão: **Passe + d10 − penalidade de distância**. Se for menor que o limiar, a bola sai torta: cai **solta**, desviada 1 casa (2 casas se faltou 3 ou mais pontos).

| Passe | Alcance e trajetória | Limiar e distância | Interceptação |
|---|---|---|---|
| **Curto** (rasteiro) | até **3** casas, linha reta | limiar 6, sem penalidade | o **1º adversário no caminho** rola **Defesa + d10** contra a sua precisão; se vencer, corta |
| **Longo** (aéreo) | até **7** casas, linha reta | limiar 9, −1 a cada 2 casas acima de 3 | passa por cima. Um adversário colado no destino disputa: **Físico + d10** contra **Físico + d10** do receptor |
| **Profundidade** (rasteiro) | casa **vazia** até 4 casas, à frente de um aliado | limiar 8, −1 a cada 2 casas acima de 2 | pode ser cortado no caminho como o curto. O aliado **corre grátis até 2 casas** para pegar a bola. Se um adversário estiver a até 2 casas da bola, **Velocidade + d10** de cada um decide |
| **Cruzamento** (aéreo) | só das **2 linhas laterais** para a **grande área** | limiar 9, sem penalidade de distância | goleiro em **Sair do gol** a até 2 casas do alvo pode pegar. Marcador colado no alvo disputa **Físico + d10**. Livre: cabeceio com **(Chute + Físico) ÷ 2 + d10** contra o goleiro, com escolha de canto |

**Empates nos passes:** o empate estagna.
- **Interceptação:** o passe não sai e a bola fica com quem passou.
- **Disputa no alto (passe longo e cruzamento) e goleiro que sai do gol:** o passe segue e o receptor continua com a bola.
- **Corrida da profundidade:** a bola fica **solta** na casa e ninguém se move neste turno.

Cada passe tem uma função: o curto constrói, o longo ultrapassa a pressão, a profundidade quebra a linha e o cruzamento transforma jogo pelos lados em chance de gol.

## 7. Chute e goleiro

- O chutador escolhe **1 de 3 cantos**: esquerda, centro ou direita.
- Chutador: **Chute + d10 − distância − 1 por marcador colado**. Distância é grátis até 4 casas e depois −1 a cada 2.
- Goleiro: **Defesa + d10**, **+4 se acertar o canto**.
- O goleiro escolhe o canto **na hora do chute** (aviso privado de 15 s). Se o tempo acabar, ele **perde a vez** de adivinhar e não ganha o +4.
- **Gol** se o chutador **vencer**. Se o goleiro vencer, é defesa e a bola fica com ele.
- **Empate:** o goleiro espalma e a bola fica **solta na casa à frente do gol** (rebote) **(proposta)**.
- Gol: a bola volta ao centro e quem sofreu o gol começa.

### Goleiro
Ele tem turno próprio na ordem normal. Escolhe uma **postura** que **vale até o próximo turno dele**:

- **Posicionar:** anda até 2 casas dentro da área. Com a bola na mão, o goleiro anda 1 casa na área para se alinhar a um aliado, ou repõe com passe curto ou longo (sem profundidade nem cruzamento).
- **Adiantar linha:** +2 para interceptar passes que cruzam a área; −1 na defesa de chutes.
- **Comandar:** dá +1 de Defesa a um aliado dentro da área.
- **Sair do gol:** disputa bolas soltas e cruzamentos na área com +3.

## 8. Bola solta

A bola solta é pega por **quem pisar nela**. Se uma casa é alcançável por duas pessoas no mesmo turno, vale quem joga primeiro.

## 9. O que reaproveitar do projeto atual

Banco de dados, atributos, XP e Ienes, giro, itens, missões, site e o esqueleto do bot. O motor de partida (`packages/engine`) e o painel do bot serão reescritos.

## 10. Fora do escopo por enquanto

Linhagens, habilidades e Flow. Voltam depois que as regras básicas estiverem divertidas.
