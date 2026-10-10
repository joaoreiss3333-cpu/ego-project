# Balanceamento: achados da simulação

Base: `pnpm simulate -- --matches 1000 --level 20 --difficulty elite --seed balance-v1` (relatório completo em `reports/simulation.md` e `reports/simulation.json`). Bots Elite de nível 20, árvore comprada até o equivalente ao nível 30 (com Despertares), loadout sorteado. 55% das partidas em 1v1, 25% em 2v2, 20% em 3v3. Nenhum número foi alterado por causa destes achados: as sugestões abaixo são para você decidir.

## Resumo

| Métrica | Valor |
|---|---|
| Gols por partida | **0,75** |
| Partidas 0 x 0 | **57%** (572 de 1000) |
| Lances por partida | 16 (todas chegam ao fim do tempo) |
| Decisão da IA | média 0,33 ms, máximo 42 ms |

Vitória por raridade no 1v1 (linhagem contra linhagem):

| Raridade | Linhagem | Vitória | Empate | Derrota |
|---|---|---|---|---|
| Comum | Kuon | 9,3% | 59,3% | 31,4% |
| Rara | Gagamaru | **0,0%** | 65,6% | 34,4% |
| Épica | Chigiri | 40,8% | 38,6% | 20,6% |
| Lendária | Isagi | **45,5%** | 34,6% | 19,9% |
| Mítica | Lavinho | **25,6%** | 55,2% | 19,2% |

## Achados, do mais importante para o menos

### 1. Poucos gols: Conter domina o drible

57% das partidas terminam 0 x 0. Na matriz, Conter dá +2 à defesa contra Driblar e é neutro contra o resto; Bote só ganha de Proteger. Como Conter também dispara duelo contra qualquer ação de bola na zona, a melhor resposta defensiva quase sempre é Conter (nos cenários de teste, a IA Elite escolheu Conter em 40 de 40 contatos sem histórico do adversário). O portador que não tem passe fica sem saída: driblar perde, conduzir para na borda.

O goleiro também pesa: `(Físico + Visão) / 2 + d10`, com +4 na zona certa, empata ou supera o `Chute + d10` típico com as penalidades de distância e ângulo.

Alavancas (em `packages/content/src/rules.ts`):
- Conter × Driblar com +1 em vez de +2. Hoje `MATCH_RULES.duel.matrixBonus` é um número só para toda a matriz; separar por célula exige uma mudança pequena em `duelMatrix` (`packages/engine/src/resolve.ts`).
- `MATCH_RULES.shot.keeperExactZone` de 4 para 3.
- `MATCH_RULES.turnsPerHalf` de 8 para 10 (mais lances, mais chances).

### 2. Mítica abaixo de Lendária e Épica

Lavinho vence 25,6% no 1v1, contra 45,5% do Isagi e 40,8% do Chigiri. O kit dele é de drible, que é justamente a ação mais punida pela matriz (achado 1). O Ritmo de Ginga só protege depois de 3 dribles vencidos, e os dribles precisam vencer Conter para contar.

É o único caso em que o Flow gira bem (a Ginga Perfeita foi ativada 154 vezes, 0,22 por partida), e mesmo assim não compensa.

Alavancas (em `lineages/lavinho.ts`):
- Ritmo de Ginga com `maxStacks: 2`, ou acúmulo também por drible tentado.
- Samba Livre com `bonus: 2`.
- Se o achado 1 for corrigido, reavaliar antes de mexer no Lavinho: ele é o mais afetado pela matriz.

### 3. Rara abaixo de Comum

Gagamaru não venceu nenhuma das 195 partidas de 1v1 (0,01 gol por partida em todos os modos). Os tetos de ataque (Chute 6, Velocidade 6, Drible 6, Passe 5) não produzem finalização, e as habilidades são todas defensivas. No 1v1 a linhagem não tem como vencer; em times ela ainda perde para todas as outras (4,8% de vitórias no geral).

Alavancas (em `lineages/gagamaru.ts`):
- Teto de Chute 7, ou uma habilidade ofensiva no ramo Instinto.
- Aceitar como linhagem de time e documentar que ela não serve para 1v1.

### 4. Flow quase nunca enche

Medição separada (200 partidas 2v2): o Flow chegou a 100 em 0 de 2.560 lances para o Gagamaru, 3 para o Chigiri, 13 para o Isagi e 77 para o Lavinho. Numa partida de 16 lances, os ganhos (drible +20, Leitura +25, gol +30, defesa +25, passe que vira finalização +15) só enchem a barra de quem dribla muito. Resultado: Muralha Viva nunca foi ativada; Pantera Vermelha 16 vezes em 670 aparições.

Alavancas (em `rules.ts`, `MATCH_RULES.flow`):
- Ganho passivo de Flow por lance (ex.: +5), que ainda não existe na regra.
- Ganhos maiores para ações defensivas (Leitura certa +35, defesa do goleiro +35).
- Flow inicial de 25.

### 5. Habilidades de informação viram uso automático

Leitura Espacial (2,54 por partida), Metavisão (2,44), Instinto Animal (1,50) e Improviso (1,38) são usadas quase sempre que saem da recarga. Custam 10 a 15 de fôlego e voltam em 3 ou 4 lances, e a informação quase sempre vale alguma coisa. O Isagi, que tem duas delas, é a linhagem com mais vitórias.

Alavancas: recarga 5 para Leitura Espacial e Metavisão, ou custo 20.

### 6. Arrancada é barata demais para a Comum

Arrancada é a ativa mais usada do jogo (2,29 por partida). Com a evolução Arrancada II o custo cai para 10, abaixo da recuperação de fôlego por lance (10): na prática fica gratuita. Mesmo assim o Kuon vence só 9,3% no 1v1, então isso não é um problema de força, mas de variedade: a linhagem vira "uma habilidade só".

Alavanca: Arrancada II com custo 12, ou recarga 3.

### 7. Habilidades que quase não acontecem

| Habilidade | Usos por partida equipada | Por quê |
|---|---|---|
| Peça que Encaixa | 0 | Exige Chute de primeira na casa marcada e o passe chegar exatamente lá. |
| Chute Direto | 0,02 | Chute de primeira é raro: o passe precisa chegar e o recebedor precisa ter planejado finalizar. |
| Passe em Curva | 0,02 | Só conta quando há defensor na linha; a IA prefere linhas limpas. |
| Corpo Elástico | 0,04 | Arma e paga custo antes; só conta se o chute acontecer perto dele. |
| Arranque Tardio | 0,05 | Metade do movimento raramente compensa. |

Parte disso é a IA sendo conservadora com habilidades condicionais, mas Peça que Encaixa e Chute Direto dependem de uma sequência rara. Alavanca: Peça que Encaixa disparar com a bola chegando na casa marcada ou em uma adjacente.

## Limitações da simulação

- Bots contra bots. A IA mistura as escolhas e aprende padrões; um humano repetitivo sofre mais contra ela (teste em `packages/engine/test/ai.test.ts`), e um humano criativo pode render mais que os números acima.
- Nível 20 com 19 pontos de atributo: nenhuma linhagem chega perto dos tetos. A vantagem das raridades altas cresce com o nível.
- A comparação por raridade usa só o 1v1, que isola a linhagem mas favorece kits de ataque.
- Para repetir com outros parâmetros: `pnpm simulate -- --matches 1000 --level 40 --difficulty chefe --seed outra-seed`.
