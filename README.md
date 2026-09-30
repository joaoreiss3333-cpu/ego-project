# EGO PROJECT

Futebol tático por turnos para Discord, inspirado em Blue Lock, com site ligado ao bot. Cada jogador cria o próprio personagem, recebe uma linhagem (tetos de atributo e árvore de habilidades) e joga partidas de 1v1 a 5v5 contra jogadores ou contra a IA.

O nome "EGO PROJECT" e o nome das moedas ficam em um só lugar: `packages/content/src/config.ts`.

## Estrutura

```
packages/
  content/   dados do jogo: linhagens, habilidades, itens, cosméticos, missões, etapas do PvE,
             playbook da IA, índice dos guias e TODOS os números de balanceamento
  engine/    motor puro e determinístico (seed), IA, treinos, replay, simulação
  db/        Prisma + PostgreSQL e a camada de serviços usada por bot e site
  render/    imagens (PNG com @napi-rs/canvas, GIF com gifenc) e arte SVG original
apps/
  bot/       discord.js v14, slash commands, Components V2
  web/       Next.js (App Router) + Auth.js com login do Discord
assets/      fontes, arte gerada e pastas para a arte final
reports/     relatório da simulação de balanceamento
```

Documentos: `DECISIONS.md` (decisões de regra), `BALANCE.md` (achados da simulação), `CREDITS.md` (licenças).

## Requisitos

- Node.js 22.9 ou mais novo (testado no 24)
- pnpm 9 (`npm i -g pnpm@9`)
- Docker (para o PostgreSQL de desenvolvimento) ou um PostgreSQL 14+ seu

## 1. Criar a aplicação no Discord

1. Abra o [Discord Developer Portal](https://discord.com/developers/applications) e clique em **New Application**.
2. **General Information**: copie o **Application ID** (vai para `DISCORD_CLIENT_ID` e `AUTH_DISCORD_ID`).
3. **Bot**: clique em **Reset Token** e copie o token (vai para `DISCORD_TOKEN`). Não precisa ligar nenhuma *Privileged Gateway Intent*: o bot usa só a intent `Guilds` (comandos slash e botões não leem mensagens).
4. **OAuth2**:
   - Copie o **Client Secret** (vai para `AUTH_DISCORD_SECRET`).
   - Em **Redirects**, adicione `http://localhost:3000/api/auth/callback/discord` (e a URL de produção do site, se tiver).
5. **Convidar o bot**: em **OAuth2 > URL Generator**, marque os escopos `bot` e `applications.commands` e as permissões **View Channels**, **Send Messages**, **Attach Files**, **Embed Links** e **Read Message History**. Abra a URL gerada e escolha o servidor.
6. Para registrar os comandos na hora durante o desenvolvimento, copie o ID do seu servidor (modo desenvolvedor do Discord ligado, clique direito no servidor > Copiar ID) para `DISCORD_GUILD_ID`.

## 2. Variáveis de ambiente

```bash
cp .env.example .env
```

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | PostgreSQL. Com o docker compose: `postgresql://ego:ego@localhost:5432/ego?schema=public` |
| `DISCORD_TOKEN` | Token do bot |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_GUILD_ID` | Opcional: registra os comandos só neste servidor (aparece na hora) |
| `SITE_URL` | URL pública do site (o bot monta os links com ela) |
| `AUTH_SECRET` | Segredo do Auth.js (`openssl rand -base64 32`) |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | Login do Discord no site (mesma aplicação) |
| `AUTH_URL` | URL do site para o Auth.js |
| `UPLOAD_DIR` | Opcional: pasta dos retratos enviados (padrão `data/uploads`) |

Todos os scripts leem o `.env` da raiz.

## 3. Banco, migrações e seeds

```bash
pnpm install
pnpm db:up          # sobe o Postgres do docker-compose.yml
pnpm db:migrate     # cria as tabelas (prisma migrate dev)
pnpm db:seed        # cria a temporada ativa
```

Em produção use `pnpm db:deploy` no lugar de `db:migrate`. O conteúdo do jogo (linhagens, itens, missões, etapas) não vai para o banco: ele vive em `packages/content` e é lido direto do código.

## 4. Arte

```bash
pnpm assets         # gera logo, molduras, tokens, placeholders e amostras em assets/
```

## 5. Registrar os comandos e subir o bot

```bash
pnpm bot:register   # registra os comandos slash (no servidor de DISCORD_GUILD_ID, ou global)
pnpm bot:dev        # bot com recarga automática
```

Partidas em andamento são salvas a cada lance. Se o bot reiniciar, ele retoma cada partida do último lance salvo, postando uma mensagem nova no mesmo canal.

## 6. Subir o site

```bash
pnpm web:dev        # http://localhost:3000
```

Para produção: `pnpm --filter @ego/web build` e `pnpm --filter @ego/web start`.

Para testar o site sem OAuth, em desenvolvimento local: `DEV_LOGIN=1` no `.env` faz a página `/entrar` aceitar qualquer Discord ID. Isso só existe fora de produção (`NODE_ENV !== 'production'`); um build de produção nunca liga esse login.

Abas do site: Perfil, Personagem (Atributos, Linhagem, Loadout), Inventário (Equipamentos, Cosméticos, Materiais), Progresso (Missões, Despertares, Maestria, Modo Seleção), Giro, Ranking (Solo, Time), Partidas (histórico e replay) e Guias. A árvore de habilidades só é comprada no site.

## Comandos do bot

`/criar-personagem`, `/perfil [usuario]`, `/atributos`, `/loadout`, `/guia [tema]`, `/partida criar modo tipo`, `/partida sair`, `/fila ranqueada modo`, `/fila sair`, `/treino drible|desarme|fisico|1v1`, `/selecao`, `/missoes`, `/girar`, `/inventario`, `/equipar`, `/ranking [modo]`, `/site`.

Gerência (permissão **Gerenciar Servidor**): `/admin dar-coins`, `/admin dar-ienes`, `/admin debug-ia`, `/admin resetar-personagem`, `/admin encerrar-partida`, `/admin config` (tempo do lance, GIF, orçamento de raridade por modo).

## Testes

```bash
pnpm test
```

- `packages/engine`: regras (campo, movimento, zonas, duelos, passe, chute, goleiro, fôlego, Flow, tempo), habilidades das 5 linhagens, determinismo por seed, treinos e IA (testes de situação e de simulação).
- `packages/db`: serviços contra um PostgreSQL real (atributos, árvore, giro com garantias, missões, energia, equipamento, fechamento de partida com travas e MMR). Pulados se não houver `DATABASE_URL`.
- `packages/render`: todas as imagens e a troca automática de placeholder por arte real.
- `apps/bot`: partida completa pelo bot com um canal falso (painel, revelação, resolução, recompensas) e validação das telas com os builders do discord.js e o limite de 40 componentes.

## Simulação de balanceamento

```bash
pnpm simulate -- --matches 1000 --level 20 --difficulty elite
```

Gera `reports/simulation.md` e `reports/simulation.json` (gols por partida, vitória por raridade, uso de cada habilidade, duração, tempo de decisão da IA). A análise está em `BALANCE.md`. Outras ferramentas: `packages/engine/scripts/tournament.ts` (compara dificuldades) e `trace.ts` (narra uma partida entre bots lance a lance).

## Mexendo no conteúdo

- **Números**: tudo em `packages/content/src/rules.ts` e nos arquivos de linhagem. Guias do site e textos do bot leem daí.
- **Nova linhagem**: crie `packages/content/src/lineages/<id>.ts` exportando um `LineageDef` e acrescente-o na lista de `lineages/index.ts`. Motor, IA, giro, site e guias passam a usá-la. Se ela usar um efeito de habilidade novo, o efeito precisa ser implementado em `packages/engine/src/resolve.ts`.
- **Nova etapa do Modo Seleção**: acrescente um grupo em `packages/content/src/selection.ts`.
- **Arte final**: salve `assets/skills/{linhagemId}/{habilidadeId}.png` e `assets/lineages/{linhagemId}.png`. Bot e site usam o arquivo se ele existir e o placeholder se não existir.

## Problemas comuns

- **`unable to get local issuer certificate`** ao instalar ou rodar o Prisma: a rede usa uma CA própria. No Node 22+, rode com `NODE_OPTIONS=--use-system-ca`.
- **Comandos não aparecem**: sem `DISCORD_GUILD_ID` o registro é global e pode levar até 1 hora.
- **`Missing Access` ao registrar**: o bot ainda não está no servidor de `DISCORD_GUILD_ID`. O `pnpm bot:register` imprime o link de convite com as permissões certas; convide e rode de novo.
- **Imagens com fonte errada**: rode `pnpm install` de novo (as fontes ficam em `assets/fonts`).
