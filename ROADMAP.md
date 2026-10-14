# GitGacha — Roadmap

> Começou com uma auditoria em 12/10/2026 (gameplay, economia, visual/UX e engenharia), juntando a lista `Ideias de melhorias GitGatcha.txt`.
> Atualizado em 14/10/2026, ao fim da primeira parte do PT-BR (PR #55). **Ondas 1 a 6 completas**; onda 7 em andamento. O backlog está organizado em **ondas** (ver "Ondas de melhorias"); decisões em aberto na tabela "Decisões pendentes".
> Inclui as ideias tiradas do **GitPacks**, jogo parecido (MIT), marcadas com 🅶. Análise completa e links para o código dele em [`docs/analise-gitpacks.md`](docs/analise-gitpacks.md).

**Legenda:** 🔴 P0 urgente · 🟠 P1 quebrado · 🟡 P2 melhoria importante · 🟢 P3 feature nova
**Esforço:** P = horas a 1 dia · M = alguns dias · G = 1 semana ou mais

---

## 👉 Como continuar (leia primeiro)

### Estado atual
- **Ondas 1 a 5 completas e em produção** (`main`, deploy na Vercel em git-gacha.vercel.app), e a onda 6 inteira (Torre, Sprints, eventos semanais, treino de cartas, coleções e cosméticos). Resumo de cada PR na seção "✅ Concluído".
- 20 jogadores, ~740 cartas únicas, ~880 cartas em coleções. 20 migrações, todas aditivas (a do histórico de BITS também grava o saldo de abertura de cada jogador).
- 212 testes (`npm test`), `tsc` sem erros, lint com 101 erros e 57 avisos (quase todos `any` antigos). O CI (GitHub Actions) roda tudo em cada PR.

### Ambiente
> **Contas de teste locais (branch dev):** credenciais em `.env.local` (ignorado pelo git): `TEST_ACCOUNT_EMAIL`/`_PASSWORD` (usuário `qaguestdc3a88`) e `TEST_ACCOUNT_2_EMAIL`/`_PASSWORD` (usuário `qaref71c99f`, o que costuma estar logado no navegador do app). As duas são amigas entre si; a 2 foi convidada pela 1. O login local redireciona para `NEXTAUTH_URL` (porta 3000); com o servidor na 3005 (`.claude/launch.json`, nome `gitgacha-dev`), volte para a 3005 depois de entrar.
>
> **Banco de dev:** em 13/10/2026 foi restaurado como cópia da produção (depois de um erro meu, ver "Lições"). Desde então recebeu as migrações #38–#47 e dados de teste: a temporada 1 foi fechada à força (o dev está na temporada 2), há batalhas Ranked/Torre/desafios das contas de teste, e o Sprint diário `daily:2026-10-12` (Ruby Day) foi criado e fechado à mão para testar o pagamento (7 jogadores receberam BITS de sprint). Depois recebeu a migração da PR #50; a conta 2 comprou e abriu um Scripting Week Pack, e o Dev da Semana de `weekly:2026-10-12` é `holman`. Depois recebeu a migração da PR #51; a conta 2 treinou `matyhtf` até o nível 1. Depois recebeu a migração da PR #52; a conta 2 foi colocada no nível 12 à mão (para testar os cosméticos) e está com o título Contributor e a moldura Silver. Para voltar a uma cópia limpa da produção: Neon → branch `dev` → Backup & Restore (ou "Reset from parent") e depois `npx prisma migrate deploy`.

| O quê | Como está |
|---|---|
| Banco de **desenvolvimento** | Branch `dev` do Neon (`ep-weathered-hill…`). `.env` e `.env.local` apontam para ela. `npm run dev`, Prisma CLI e testes locais usam essa cópia. |
| Banco de **produção** | Branch `production` do Neon (`ep-floral-salad…`). Só pelo `.env.prod`, usado de propósito pelos scripts: `node --env-file=.env.prod --import tsx scripts/<script>.ts` |
| Deploy | Vercel com Fluid compute. O build `scripts/vercel-build.mjs` só migra no deploy de **produção**, só quando há migração pendente, pela conexão **direta** do Neon (o pooler prendia a trava do Prisma, erro P1002). |
| Cron | `/api/cron/rebuild-fallback-pool`, diário (`vercel.json`), protegido por `CRON_SECRET` (já configurado na Vercel). Até 300 s; retoma de onde parou. |
| GitHub | `GITHUB_TOKEN` do servidor: 5.000 req/h core e 30/min de busca. O login com GitHub funciona; o OAuth App tem callback `https://git-gacha.vercel.app/api/auth/callback/github`. |

### Regras de ouro do projeto
1. **Sorteio justo é o núcleo do jogo.** Dentro do filtro do booster, todo dev da raridade sorteada (com ≥1 repositório público) tem a **mesma chance**, inclusive o próprio jogador. Nunca trocar por um pool curado. Os testes de qui-quadrado em `src/lib/devSampler.test.ts` precisam continuar passando.
2. **A raridade precisa poder virar filtro de busca do GitHub.** Hoje ela vem da faixa de seguidores (0–49 / 50–199 / 200–999 / 1.000–4.999 / 5.000+), com +1 nível por estrelas (1k/3k/10k/30k). Sem isso o sorteio uniforme não funciona.
3. **Moeda e campos JSON do usuário só mudam dentro de `withUserLock`** (`src/lib/userLock.ts`). Nada lento, como chamadas ao GitHub, dentro da trava. **BITS só mudam por `addBits` / `spendBits`** (`src/lib/bitsLedger.ts`), que gravam o histórico na mesma transação; um teste falha se outro arquivo mexer em `currency` direto.
4. **Ao mudar a fórmula de status, os multiplicadores ou as regras do pool**, subir `STAT_VERSION` (`src/lib/cardStats.ts`) e rodar `scripts/recalculate-cards.ts --apply` logo depois do deploy.
5. **Escrita em produção só com aprovação do dono** e sempre com `--env-file=.env.prod`. Migrações devem ser aditivas; o deploy de produção as aplica.
6. Números de jogo vivem em `src/lib/rarity.ts`, `battleConfig.ts`, `cardStats.ts`, `loginCalendar.ts`, `pity.ts` e `achievementUtils.ts`. A **wiki é gerada deles**; não duplicar números na UI.

### Scripts úteis
| Comando | Para quê |
|---|---|
| `npm test` | Testes puros, sem banco nem rede (~90 s, por causa do simulador) |
| `node scripts/lint-budget.mjs` | Lint com orçamento de erros (o mesmo do CI) |
| `node --env-file=.env.prod --import tsx scripts/check-bits-ledger.ts` | Só leitura: confere se o histórico de BITS de cada jogador soma o saldo |
| `node --import tsx scripts/balance-sim.ts [seed] [fame\|impact]` | Simulador de balanceamento |
| `node --import tsx scripts/stat-examples.ts` | Status de devs conhecidos nas duas fórmulas |
| `node --env-file=.env.prod --import tsx scripts/recalculate-cards.ts [--apply] [--only=a,b]` | Recalcula cartas; contas apagadas recebem a mediana da raridade |
| `node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts [--apply]` | Refaz ratings pelo histórico PvP. Ignora os resets de temporada: depois que uma temporada fecha, o `--apply` recusa sem `--force` |
| `node --env-file=.env.prod --import tsx scripts/dedupe-user-cards.ts [--apply]` | Junta cartas duplicadas, que viram fragmentos |
| `node --env-file=.env.prod --import tsx scripts/backfill-card-profiles.ts [--apply]` | Preenche o retrato do perfil no GitHub das cartas (só as colunas de perfil; status não mudam). 2–4 chamadas REST por carta |
| `node --env-file=.env.prod scripts/seed-changelog.js` | Seed do changelog (cria entradas novas) |

---

## ▶️ Próximo passo

**Onda 7 (celular, acessibilidade e idioma)**, uma PR por rodada:
1. **PT-BR, parte 2 (7c-2):** Arena e montador de time, Torre, desafios, ranking, Sprints, amigos, perfil (com o seletor de título/moldura e o GitHub), histórico de BITS e as páginas públicas (`/u`, `/card`, `/try`, `/challenge`, login). Mesmo método da parte 1, seguindo o guia [`docs/i18n.md`](docs/i18n.md) (regras, glossário PT-BR, verificação); os namespaces `battle`, `leaderboard`, `social`, `profile` e `public` já existem, vazios.
2. **PT-BR, parte 3 (7c-3):** os textos que vêm dos dados do jogo, que hoje aparecem em inglês mesmo em PT-BR: nomes e descrições dos packs, missões, conquistas, passos do "Primeiros passos", guia de BITS, passivas e regras das ligas, nomes das raridades (decidir se traduz), mensagens de erro das APIs e notificações; depois a wiki inteira (namespaces `game` e `wiki`).

Depois: **onda 8** (engenharia de fundo, pode intercalar) e **onda 9** (grandes apostas e monetização).

**Pendências do dono (fora do código), deixadas para o fim, junto com as decisões:**
- O workflow "Database backup" continua agendado e falha todo dia até a chave existir. Pausar: `gh workflow disable "Database backup"` (ou Actions → Database backup → ⋯ → Disable workflow); reativar com `gh workflow enable` depois de configurar.
- Configurar o backup diário: chave `age` + `BACKUP_AGE_RECIPIENT` + `BACKUP_DATABASE_URL` no GitHub ([`docs/backup.md`](docs/backup.md)). Sem isso o workflow "Database backup" falha.
- Rodar uma vez a conferência do histórico de BITS em produção (só leitura): `node --env-file=.env.prod --import tsx scripts/check-bits-ledger.ts`.
- Responder a tabela "Decisões pendentes" abaixo.

**Como trabalhamos (para o próximo chat):**
- Conversa em português; código e interface em inglês. Uma rodada = uma branch + uma PR com descrição em português; **merge só com OK do dono e com o CI verde** (esperar o "Types, lint, tests and build" passar).
- Testar no navegador do app com o servidor de dev e o banco de dev; escrever em produção só com OK explícito.
- Decisões de produto (valores, regras) **não travam a rodada**: entra o padrão sensato e a decisão vai para a tabela abaixo.
- Atualizar este ROADMAP ao fim de cada rodada (estado, concluído, backlog, decisões).

**Lições (não repetir):**
- **Nunca** passar uma URL de banco real como `--shadow-database-url` do Prisma: ele limpa o banco (apagou o dev em 13/10/2026). Para conferir schema × migrações, escrever o SQL da migração à mão e aplicar com `npx prisma migrate deploy` no dev.
- Scripts de edição longos com apóstrofos dentro de heredoc no Bash do Windows quebram; gravar o script num arquivo e rodar com `python arquivo.py`.
- `git push`/merge de PR antes do CI terminar já aconteceu uma vez (#39); conferir o status antes.
- **Ao adicionar dependência, gerar o lock com o npm do CI** (Node 22 → npm 10): `npx -y npm@10.9.2 install --package-lock-only`. O npm 11 local omite dependências opcionais que o `npm ci` do CI exige, e o CI falha no Install (aconteceu na #55).

## 🗳️ Decisões pendentes (o dono responde tudo de uma vez)

Valores e regras já no ar com um padrão; mudar qualquer um é só trocar a constante indicada.

| PR | Decisão | Padrão no ar | Onde mudar |
|---|---|---|---|
| #39 | Bônus do primeiro compartilhamento | 100 BITS | `SHARE_BONUS` (`shareBonus.ts`) |
| #40 | Indicação de amigos | 200 BITS cada, teto de 10 indicações pagas | `REFERRAL_BONUS`, `REFERRAL_CAP` (`referral.ts`) |
| #40 | Pesos do Ranking Colecionador | Common 1 · Uncommon 2 · Rare 5 · Epic 12 · Legendary 30 | `COLLECTOR_POINTS` (`collectorScore.ts`) |
| #41 | Troca de fragmento coringa | 3 fragmentos → 1 coringa | `WILDCARD_EXCHANGE_RATE` (`fragments.ts`) |
| #41 | Repetida que rola Shiny | A carta vira Shiny (outra opção: dar algo extra) | `addCardToUser` (`boosterService.ts`) |
| #42 | Missões semanais / de dev | 800–1000 / 150–200 BITS | `WEEKLY_MISSION_POOL`, `DEV_MISSION_POOL` (`missionUtils.ts`) |
| #42 | Troca de missão diária | 1 por dia | `rerollDailyMission` (`economyService.ts`) |
| #42 | Botão de resgatar missões | Não feito: missões pagam sozinhas ao completar | — |
| #44 | Faixas dos elos | Silver 1050 · Gold 1150 · Platinum 1300 · Diamond 1450 | `RANK_TIERS` (`ranks.ts`) |
| #44 | Recompensas do Ranked | 60 BITS vitória / 10 derrota; defesa que segura +20 | `LEAGUES.RANKED`, `RANKED_DEFENSE_WIN_BITS` (`battleConfig.ts`) |
| #44 | Time atacado perde rating mesmo offline? | Sim (ELO normal dos dois lados) | `resolveRankedBattle` (`battleService.ts`) |
| #45 | Promoção de elo na temporada | Silver +100 · Gold +200 · Platinum +400 · Diamond +800 | `PROMOTION_BITS` (`seasons.ts`) |
| #45 | Fim de temporada | Pelo **pico**: Bronze +100 … Diamond +1200 | `SEASON_REWARD_BITS` (`seasons.ts`) |
| #45 | Reset de temporada | Metade do caminho até 1000 | `softResetRating` (`seasons.ts`) |
| #46 | Aposta máxima em desafio | 500 BITS cada | `CHALLENGE_STAKE_MAX` (`battleConfig.ts`) |
| #46 | Desafio direto só entre amigos | Sim (para os outros, link) | `areFriends` na rota `api/battle/challenge` |
| #47 | Recompensas da Torre por andar | 40 · 50 · 60 · 80 · **200** · 100 · 120 · 150 · 200 · **600** (5 e 10 são chefes) | `TOWER_FLOORS` (`tower.ts`) |
| #47 | Composição dos andares | Commons no andar 1 até 3 Legendaries no 10 | `TOWER_FLOORS` (`tower.ts`) |
| #47 | Tentativas na Torre | Ilimitadas (só custam stamina); o ranking desempata por menos tentativas | `fightTower` (`towerService.ts`) |
| #49 | Recompensas dos Sprints | Diário: 1º 200 · 2º 120 · 3º 80 · 4º–10º 30. Semanal: 1º 1000 · 2º 600 · 3º 400 · 4º–10º 150 | `SPRINT_REWARDS` (`sprints.ts`) |
| #49 | Pontuação do Sprint | Soma de ATK+DEF+HP das **3 melhores** cartas do tema (outra opção, a do GitPacks: a melhor de cada raridade, até 5) | `SPRINT_TEAM_SIZE`, `sprintStandings` (`sprintService.ts`) |
| #49 | Cartas que contam | Todas as que o jogador tinha **antes do fim** do Sprint, inclusive as de antes do início (outra opção: só as tiradas durante o Sprint) | `sprintStandings` (`sprintService.ts`) |
| #49 | Temas | Diário: 15 linguagens em rodízio. Semanal: 6 famílias (Web, Sistemas, Dados, JVM & .NET, Scripting, Mobile). Sem tema de org por enquanto (poucas cartas) | `DAILY_SPRINT_LANGUAGES`, `WEEKLY_SPRINT_FAMILIES` (`sprints.ts`) |
| #50 | Pack do evento semanal | 5 cartas, 350 BITS, ≥1 Rare; só à venda na semana do tema | `EVENT_PACK_COST`, `EVENT_PACK_MIN_RARITY` (`weeklyEvents.ts`) |
| #50 | Desconto do Dev da Semana na forja | 50% em fragmentos e BITS | `FEATURED_DEV_DISCOUNT` (`weeklyEvents.ts`) |
| #50 | Quem pode ser Dev da Semana | Sorteio uniforme entre as cartas do tema já existentes no jogo, Rare ou melhor (qualquer raridade se não houver) | `FEATURED_DEV_MIN_RARITY` (`weeklyEvents.ts`), `drawFeaturedDev` (`weeklyEventService.ts`) |
| #50 | Rate-up anunciado | **Não feito**: dar mais chance a certos devs fere a regra de ouro 1. Se quiser, decidir as regras (quem, quanto, aviso na loja) | — |
| #51 | Teto de treino por raridade | Common 8 · Uncommon 4 · Rare 4 · Epic 3 · Legendary 3 (+2% por nível). Medido no simulador: treino completo ≈ empata com a raridade de cima | `TRAINING_MAX_LEVEL`, `TRAINING_BONUS_PER_LEVEL` (`training.ts`) |
| #51 | Custo do treino | Nível n = n × passo; passo Common 50 · Uncommon 100 · Rare 200 · Epic 400 · Legendary 800 BITS + n × fragmentos de uma repetida (5/10/20/40/80) | `TRAINING_BITS_PER_STEP`, `TRAINING_FRAGMENTS_PER_STEP` (`training.ts`) |
| #51 | Teto da Liga Balanced com cartas treinadas | Conta o poder **base** (como a fidelidade já fazia) | rota `api/battle` e `TeamBuilderUI` |
| #52 | O que é uma coleção | Uma por linguagem de combate (18), com uma vaga por raridade. "Completar o elenco de um pack" não existe: os packs sorteiam entre milhões de devs, sem lista fechada | `COLLECTION_LANGUAGES`, `collectionProgress` (`collections.ts`) |
| #52 | Títulos e molduras | Títulos: nível 10/25/50, 1/3/10 coleções e "<Linguagem> Collector". Molduras: nível 5/10/20/35, 1 e 5 coleções | `TITLES`, `FRAMES` (`collections.ts`) |
| #52 | Coleção completa paga BITS? | Não, só cosméticos (pagar exigiria guardar quem já recebeu) | — |
| #52 | Níveis liberando modos | Não feito: travaria modos que hoje são livres. Os níveis liberam títulos e molduras | — |
| #55 | Como escolher o idioma | Cookie `NEXT_LOCALE`, sem `/pt` na URL; o primeiro acesso segue o navegador (qualquer `pt` vira PT-BR). Seletor "EN/PT" no topo e no menu | `pickLocale` (`src/i18n/locales.ts`) |
| #55 | Termos do PT-BR | "pack", "booster", "Shiny", "stamina", "Ranked", "rating" e "Daily Standup" ficam em inglês (jargão de jogo/dev); Forja, coringa, lealdade, treino, elo, temporada, Torre em português; "Changelog" virou "Novidades". Glossário completo em `docs/i18n.md` | `messages/pt-BR/*.json` |
| #55 | Nomes das raridades | Em inglês por enquanto (Common… Legendary), também em PT-BR. Traduzir (Comum/Incomum/Raro/Épico/Lendário) entra na parte 3 se o dono quiser | — |
| #46 | Seletor de liga na aba de desafio | Continua aparecendo, mas não muda nada nos desafios entre amigos (já era assim) | `TeamBuilderUI` |

---

## 🌊 Ondas de melhorias (ordem sugerida)

Cada onda junta itens do backlog abaixo que fazem sentido juntos e cabem em 1–3 rodadas (uma PR por rodada). Os números entre parênteses apontam para a seção do backlog.

| Onda | Tema | O que entra | Tamanho |
|---|---|---|---|
| **1** | 🧹 Casa arrumada | ✅ Pontas soltas (PR #34), CI e backup (PR #35), bônus por zebra (PR #36). Common × Uncommon (82%) fica como está, por decisão do dono. **Falta só o dono configurar a chave do backup** (`docs/backup.md`) | feito |
| **2** | 👋 Primeira impressão | ✅ Onboarding, pack inicial e boas-vindas (PR #37); pack de visitante, compra com odds, estados vazios e skeleton (PR #38) | feito |
| **3** | 📣 Crescimento | ✅ Compartilhar (PR #39); indicação de amigos, comparar coleção e Ranking Colecionador (PR #40) | feito |
| **4** | 🃏 Coleção e economia | ✅ Repetidas, Shiny em repetidas, coringa (PR #41); missões semanais, de dev e troca diária (PR #42); histórico de BITS (PR #43) | feito |
| **5** | ⚔️ Competitivo | ✅ Elos e Ranked "fantasma" (PR #44), temporadas (PR #45), desafios com link, aposta e revanche (PR #46) · fica no backlog: partidas de colocação e melhor de 3 | feito |
| **6** | 🗼 Modos e cartas | ✅ Torre (PR #47), Sprints 🅶 (PR #49), eventos semanais (PR #50), treino de cartas (PR #51), coleções e cosméticos (PR #52) | feito |
| **7** | 📱 Celular, acessibilidade e idioma | ✅ barra de abas, PWA e páginas sem vazamento lateral (PR #53); teclado, modais, contraste AA, volume e sons de Epic/Legendary (PR #54); PT-BR parte 1 (PR #55) · falta: **PT-BR partes 2 e 3** (2.5) | 2 rodadas, M–G |
| **8** | 🔧 Engenharia de fundo | Índices, `select` nas consultas quentes, zod nas rotas, Sentry, CSP, lint, `proxy.ts`, testes de concorrência, upgrade Prisma/Auth.js, JSON → tabelas (2.8). **Pode ser intercalada** com as outras ondas | contínua |
| **9** | 🚀 Grandes apostas | Liga estilo Cartola (3.2), carta "viva" (3.3), presentes e trocas (3.4), animações e replay de batalha (3.5), feed de amigos; depois **monetização** (Fase 4, com o histórico de BITS da onda 4 e parecer jurídico) | G |

**Por que essa ordem:** a onda 1 tira dinheiro preso e bugs de balanceamento antes de trazer gente nova, e o CI protege as ondas seguintes. A onda 2 vem antes da 3 porque não adianta divulgar se o jogador novo se perde no primeiro minuto. A onda 4 dá o que fazer com as cartas repetidas, e a 5 dá sentido ao rating que já está correto.

---

## ✅ Concluído

### Fase 0 — Segurança e integridade (PR #19, #21, #26)
- `postinstall` que rodava `prisma db push --accept-data-loss` removido; migrações versionadas (baseline `0_init`).
- `benchmark.ts` (apagava tabelas) removido. `prisma/dev.db` (e-mails e hash de senha) apagado do histórico do git.
- BITS, packs, daily, missões, forja, stamina, desafios, notificações e recompensas atômicos (`withUserLock`). Pack que falha antes de entregar cartas é devolvido.
- Rota de login legada removida. Limite de tentativas (`RateLimitHit`) em cadastro, login (por e-mail+IP e IP), forja, loja, daily e batalha.
- Validação das imagens de perfil. `/inventory` e `/forge` protegidos. Cron protegido por `CRON_SECRET`.
- Cartas duplicadas juntadas e restrição única `UserCard(userId, cardId)`.
- Banco de desenvolvimento separado (branch `dev` no Neon).

### Sorteio justo (PR #19, #20, #23, #24)
- `src/lib/devSampler.ts`, com três estratégias, todas uniformes:
  - **por ID de conta:** Commons dos packs amplos;
  - **por janelas de busca sobre a curva de cadastro do GitHub:** com limite de rejeição, o que contorna o teto de 1.000 resultados sem viés;
  - **por membros de organizações:** pack Big Tech (Google, Microsoft, Meta, AWS, Apple, Netflix, GitHub, Vercel, Shopify, Stripe, OpenAI).
- Exige ≥1 repositório público. Aceita logins antigos (`LingDong-`, `a--b`).
- **Reserva consumível** (`boosterReserve.ts`): devs pré-sorteados, cada um usado uma vez e repostos em segundo plano. Boosters instantâneos, aguentam picos.
- **Token do próprio jogador:** quem conecta o GitHub usa a própria cota de busca.
- Cache no banco (`GithubCache`), tirados recentemente (`RecentPull`), pools de orgs (`OrgMember`).

### Conectar GitHub e carta Signature (PR #20, #21)
- Painel no perfil, com +300 BITS na primeira conexão.
- O jogador ganha **a própria carta na edição Signature** (foil exclusiva, nunca sai em booster nem na forja).
- Login com GitHub corrigido: o GitHub passou a mandar o parâmetro `iss` (RFC 9207), que o next-auth v4 recusava. Agora ele é validado e removido na rota de auth.

### Fase 1 — Bugs e UX (PR #21)
- **Ranking:** rating só muda em PvP; desempate; só aparece quem já jogou; Rivais = amigos. Ratings refeitos pelo histórico.
- **Missões diárias:** pool de 16, renovam à meia-noite UTC; "Collect Rare" conta raridades maiores.
- **Batalha:**
  - stamina com piso 0, recuperando para todas as cartas;
  - desafio não expõe o time, e uma carta não fica em dois desafios;
  - oponente PvE aleatório; regra de empate única;
  - liga Legendary paga 900 (taxa de 500).
- **Booster e interface:**
  - booster sem dica cobrindo os status;
  - áudio desbloqueia no primeiro gesto, com mute salvo;
  - toasts globais, BITS sincronizados (evento `bits:refresh`), painel "como ganhar BITS";
  - level up sem recarregar; link da forja abre o pack certo; Amigos no menu.
- **Wiki** gerada do código. Limpeza do repositório, dependências, README e `.env.example`.
- **Acessibilidade:** respeita "reduzir movimento"; zoom liberado no celular.

### Fase 2 — Balanceamento e progressão (PR #22)
- **Fórmula "fama"** (`cardStats.ts`): status crescem com estrelas+forks, repositórios e idade, em escala log/raiz. Multiplicadores de raridade quase planos.
- **Combate:** DEF com mitigação percentual; 9 linguagens novas com passiva (Java, C#, Kotlin, Swift, Shell, HTML, PHP, Dart, Jupyter); tabela de tipos ampliada.
- **Simulador com metas testadas:** Legendary vence Common ~100%; raridades vizinhas 71–76%; mesma raridade ~50%.
- **Booster estilo pack físico:** rasgar o pack, pilha para virar e arremessar, suspense para Epic/Legendary, "Revelar tudo", sons, pular o mini-game.
- **Cartas:** moldura por raridade e brilho holográfico (mouse ou inclinação) em Epic+ e Shiny.
- **Progressão:**
  - calendário de login de 7 dias (Mystery Box no 7º);
  - 10 conquistas Bronze/Prata/Ouro, pagas uma vez por nível (as já cumpridas foram pagas como presente de lançamento);
  - pity com Legendary garantida em até 30 packs.

### Identidade visual (PR #29)
- **Logo** (`src/components/Logo.tsx`): cápsula de gacha cortada pela linha de commits; o botão é um commit. Favicon em `src/app/icon.svg`.
- **Paleta e fontes** (`globals.css`, `layout.tsx`): as escalas `slate` e `indigo` do Tailwind foram retingidas (tinta violeta e violeta da marca), então todo o jogo mudou sem mexer em cada tela. Marca `brand-a/brand-b` (#7C4DFF → #FF4FA3), `commit` (#3DDC97). Fontes: Unbounded (logo/títulos), Chakra Petch (interface), JetBrains Mono (números), Caveat (autógrafo).
- **Carta nova** (`Card.tsx` + `.gg-*` no `globals.css`): cantos chanfrados, material por raridade (Epic/Legendary com moldura girando), trilha de commits de 1 a 5 nós como raridade, hash de série, emblema de linguagem, **passiva escrita na carta** (`cardPassive` em `battleConfig.ts`, mesmos números da wiki), flavor como mensagem de commit, 3D seguindo o mouse.
- **Booster:** verso e arte do pack com o logo. Galeria só de desenvolvimento em `/dev/cards` (404 em produção). Proposta original em `docs/visual-proposta.html`.

### Títulos nas cartas 🅶 (PR #30, #32)
- **Retrato do perfil no GitHub** salvo em `Card` (seguidores, estrelas, forks, estrelas do repo principal, repos, gists, nº de linguagens, criação da conta), migração aditiva `20261017000000_card_github_profile`. Preenchido em toda busca ao vivo (booster, forja, Signature) via `toCardData`; as cartas antigas, por `scripts/backfill-card-profiles.ts`.
- **`cardTitle`** (`src/lib/cardVisuals.ts`): o traço mais forte do dev em 4 níveis (estrelas, repo principal, seguidores, forks, repos, linguagens, gists, idade). Idade só a partir de 14 anos de conta (Pre-Cloud Elder, Remembers SVN).
- Combinações engraçadas (Side Project Graveyard, Fork Bomb, Social Butterfly, Ancient Lurker) e piadas por linguagem ou genéricas para perfis quietos. Passar o mouse mostra o motivo.
- Só cosmético: calculado na hora, não sobe `STAT_VERSION`. Cartas sem retrato ficam com "linguagem + patente".

### Booster rasgável (PR #31)
- Arrastar pela faixa de cima rasga o pack; a luz vaza na cor da melhor carta, com faíscas de foil. Tocar, Enter ou Espaço rasgam de uma vez.
- Depois do rasgo, o maço sobe para fora do pack e a embalagem cai (modo de entrada `emerge`). O rasgo completa mesmo sem áudio.
- Galeria `/dev/cards` ganhou um booster de teste (não gasta BITS nem salva) e `?autoplay=Rare|Epic|Legendary`.

### Onda 1 — pontas soltas (PR #34)
- **Taxa da liga Legendary:** a batalha contra o computador e os BITS dela são salvos numa transação só; qualquer erro antes disso devolve a taxa. XP, stamina e fidelidade depois da batalha só registram erro, não derrubam o resultado.
- **Pack com 0 cartas:** vira erro (`EmptyPackError`) antes de entregar algo, então o pack volta para o inventário e o pity consumido continua valendo.
- **Fidelidade das cartas:** `processPostBattleCardStats` trava as linhas das cartas (em ordem de id) antes de ler; batalhas paralelas com a mesma carta não perdem incremento.
- **Pity:** o pack do pity não zera de novo o contador (ele já foi zerado ao consumir o pity), então o +1 de um pack aberto em paralelo não se perde.
- **Rust × Go:** as cartas entram juntas: primeiro o Escudo de Ferro, depois todos os Primeiros Golpes ao mesmo tempo. O escudo dura o turno de entrada inteiro (como a descrição sempre disse), então o erro do CSS não o gasta.
- **Sinergia Python:** cada carta cura pela maior taxa entre a própria e a da sinergia; 3 Python agora curam 12% em vez de 10%.
- **Contagem das missões:** o servidor manda o tempo restante, não a hora; relógio do celular adiantado não trava mais.
- **iOS:** a inclinação holográfica pede permissão no primeiro toque.
- `resolve3v3Battle` usa o tamanho dos times em vez de 3 fixo (prepara a Torre).

### Bônus por zebra (PR #36)
- Vencer um time de raridade média maior paga **+25% de BITS por nível de diferença, até +100%** (`UPSET_BONUS` em `battleConfig.ts`); XP não muda. Vale em todas as ligas e nos desafios entre amigos.
- A tela de resultado mostra "Upset! +N%"; a wiki explica a regra.

### Onda 2 — onboarding (PR #37)
- **Pack inicial:** ao escolher o nome de usuário pela primeira vez, o jogador ganha **The Open Source Heroes** (Rare ou melhor garantida). Jogadores antigos não entram no onboarding (`User.onboarding` nulo, migração `20261018000000_onboarding`).
- **Tela de boas-vindas 🅶** (`WelcomeModal`): o presente com "Open it now" e todas as formas de ganhar BITS e packs, com os números lidos das constantes (`src/lib/earnGuide.ts`).
- **Checklist "Getting started"** (`OnboardingChecklist`, `src/lib/onboarding.ts`): abrir o pack (+50), ver a coleção (+50), montar um time de 3 (+100) e jogar a primeira batalha (+200). O progresso vem dos dados do jogo; só "viu a coleção" é guardado. Recolhe no celular, pode ser escondido.
- **BITS iniciais unificados em 1.000** (`STARTING_BITS`): o cadastro por e-mail dava 500 e o por Google/GitHub dava 1.000. Um teste garante que o default do schema continua igual.
- **Bugs do cadastro corrigidos:** o nome do próprio jogador não conta mais como "já em uso" na tela de configuração, e dois e-mails com o mesmo prefixo (`joao@a.com`, `joao@b.com`) não derrubam mais o segundo cadastro.

### Onda 2 — pack de visitante e loja (PR #38)
- **Pack de visitante 🅶** (`/try`, botão na página inicial): 1 Mystery Box sem cadastro, com o sorteio uniforme normal (reserva → GitHub → carta existente, via `drawPackDevs`, compartilhado com os boosters). As cartas ficam numa `GuestPull` (migração `20261019000000_guest_pull`) com o id num cookie httpOnly por 7 dias; ao escolher o nome de usuário, **só contas novas** recebem as cartas (`claimGuestPull`), e a tela de boas-vindas avisa. Limites: o mesmo cookie não sorteia de novo, 3 por IP por dia, 120 por hora no total.
- **Confirmação de compra:** custo, saldo depois e a chance de vir pelo menos uma carta de cada raridade **naquele pack** (`packAtLeastOdds` em `rarity.ts`, componente `PackOdds`), com o pity; botões "Buy" e "Buy & open" (`/inventory?open=<pack>`). O toast pós-compra virou "Open now".
- **Odds na abertura:** o inventário mostrava odds escritas à mão (e "??? Unknown Odds" na Mystery Box); agora usa o mesmo `PackOdds`, calculado das constantes.
- **Estados vazios com ação** (`EmptyState`): coleção vazia ou busca sem resultado, forja sem fragmentos, amigos, histórico de batalhas.
- **Skeleton** na grade de packs enquanto o catálogo carrega.

### Onda 3 — compartilhar (PR #39)
- **Páginas públicas, sem login:** `/card/<login>` (a carta, título, passiva, quem tem a Signature, convite para o pack grátis) e `/u/<username>` (nível, rating, coleção por raridade, Signature e as 6 melhores cartas). O `/profile/<username>` continua sendo o perfil completo, só para quem está logado.
- **Imagens de preview** (`next/og`): `opengraph-image` das duas páginas (1200×630) e `/api/card-image/<login>[?edition=signature]` (PNG 400×560 da carta, cache de 1 dia). A carta das imagens é uma versão simplificada do `Card.tsx` em `src/lib/shareCard.tsx`, porque o satori só entende estilos inline.
- **Compartilhar:** `ShareButtons` (copiar link, X, compartilhamento nativo do celular) nas páginas públicas; "Share" no detalhe da carta na coleção; o compartilhar do perfil agora copia o link público. Sem permissão de área de transferência, o link aparece numa caixa para copiar à mão.
- **"Copy for README"** da carta Signature no painel do GitHub: markdown com a imagem e o link para a página pública.
- **Bônus único de compartilhar:** 100 BITS na primeira vez (`SHARE_BONUS`, coluna `shareBonusGranted`, migração `20261020000000_share_bonus`).
- `Card.tsx` passou a ter `'use client'` (usa hooks e agora aparece em páginas de servidor). `metadataBase` no layout vem de `siteUrl()` (`NEXT_PUBLIC_SITE_URL` › `VERCEL_PROJECT_PRODUCTION_URL` › `NEXTAUTH_URL`).

### Onda 3 — indicação, comparar coleção, colecionadores (PR #40)
- **Indicação de amigos 🅶** (`referral.ts`, `referralService.ts`): o código é o nome de usuário, num link `/try?ref=<nome>` (leva ao pack grátis). O `?ref` fica num cookie por 30 dias (`ReferralCapture`) e preenche o campo "Invited by" do modal de nome. Ao escolher o nome, **só contas novas** guardam quem convidou (`User.referredById`, sem autoindicação, uma vez só; migração `20261021000000_referrals`). Quando o indicado **conecta o GitHub** (evento `linkAccount`, ou na hora se entrou com GitHub), os dois ganham **200 BITS** (`REFERRAL_BONUS`); quem convidou recebe por no máximo **10** indicações (`REFERRAL_CAP`). Pagamento atômico com as duas linhas travadas, e notificação para os dois. Painel "Invite friends" em Amigos, com o link e as contagens.
- **Comparar coleção 🅶:** botão em cada amigo abre "They have, you don't" / "You have, they don't" (`/api/friends/compare`, só entre amigos aceitos, as 120 mais raras de cada lado), com link para a página pública de cada carta.
- **Ranking Colecionador 🅶:** aba "Collectors" no ranking. Pontos por carta única: Common 1 · Uncommon 2 · Rare 5 · Epic 12 · Legendary 30 (`collectorScore.ts`), somados num SQL só. O bônus por set fica para quando existirem sets (3.3).

### Onda 4 — repetidas e fragmentos (PR #41)
- **Repetidas contadas:** puxar uma carta que já tem soma 1 em `UserCard.quantity` (x2, x3… na carta; "Total Pulls" da coleção soma as repetidas). Os 29 registros antigos de repetidas não dizem qual carta era, então a contagem vale daqui para frente.
- **Shiny em repetidas:** toda puxada rola os mesmos 5% (`SHINY_CHANCE`); uma repetida de carta não-Shiny a transforma em Shiny ("Duplicate turned Shiny!" na revelação). A forja usa a mesma constante.
- **Fragmento coringa** (`src/lib/fragments.ts`): 3 fragmentos de qualquer linguagem → 1 coringa (`/api/forge/exchange`). Na invocação, a linguagem paga primeiro e os coringas completam (`planFragmentPayment`).
- **Caso Keslley:** a forja recusava devs **sem linguagem principal** ("Developer lacks a primary language"). Agora eles são invocáveis, pagos só com coringas.
- **Constantes de fragmentos** (`DUPLICATE_FRAGMENTS`, `PACK_DROP_CHANCE`, `PACK_DROP_FRAGMENTS`, `SHINY_CHANCE`) saíram do `boosterService` para `fragments.ts`; a wiki usa as mesmas (e deixou de dizer que todo booster solta fragmentos: é 15%).
- **"Comprar carta da wishlist" já existia:** a forja invoca qualquer dev do GitHub com fragmentos + BITS. "Wishlist aumenta chance" não foi feito (feriria a regra de ouro 1).

### Onda 4 — missões semanais e de dev (PR #42)
- **Períodos de missão** (`UserMission.period`, migração `20261022000000_mission_periods`): cada um tem o próprio conjunto, trocado quando o período vira (`ensureMissions` em `economyService.ts`).
  - **daily:** 3 por dia, como antes.
  - **weekly:** 2 por semana, renovadas segunda 00:00 UTC (`WEEKLY_MISSION_POOL`: 10 boosters, 8 vitórias, 3 Epic+, 10 Rare+; 800–1000 BITS). Contam os mesmos eventos das diárias.
  - **dev 🅶:** 1 por dia, só para quem conectou o GitHub (`DEV_MISSION_POOL`: commit, abrir PR, abrir issue, revisar PR, comentar; 150–200 BITS). O botão "Check GitHub" busca `GET /users/{login}/events/public` com o token do jogador e paga uma vez se a atividade de hoje (UTC) estiver lá (`githubActivityDone`). Só atividade pública; o GitHub pode demorar alguns minutos.
- **Troca diária:** 1 missão diária não concluída pode ser trocada por dia (`User.missionRerollAt`, `/api/missions/reroll`).
- A seção de missões da loja virou `MissionsPanel` (hoje · esta semana · dev). As missões continuam pagando sozinhas ao completar; só a de dev tem botão, porque precisa consultar o GitHub.

### Onda 4 — histórico de BITS (PR #43)
- **`BitsTransaction`** (migração `20261023000000_bits_ledger`): uma linha por mudança de saldo, com valor (com sinal), saldo depois, motivo (`bitsReasons.ts`) e detalhe. A migração grava o **saldo de abertura** de cada jogador, então a soma do histórico sempre bate com o saldo.
- **`addBits` / `spendBits`** (`src/lib/bitsLedger.ts`) são a única forma de mudar BITS: saldo e linha na mesma transação; `spendBits` é um UPDATE condicional (`currency >= valor`) com `RETURNING`. Os 16 pontos que mexiam em BITS foram convertidos (compra, forja, stamina, taxa e reembolso de liga, batalhas, missões, daily, level up, conquistas, GitHub, compartilhar, onboarding, indicação, BITS iniciais — o cadastro por OAuth é registrado no evento `createUser`).
- **Guarda:** `bitsLedger.test.ts` falha se algum arquivo além do ledger escrever em `currency`.
- **Tela `/bits`** (link "History" no painel de BITS do menu): cada ganho e gasto com motivo, detalhe, valor e saldo, 50 por página.
- **`scripts/check-bits-ledger.ts`**: confere, só lendo, se o histórico de cada jogador soma o saldo.

### Onda 5 — elos e Ranked "fantasma" (PR #44)
- **Elos** (`src/lib/ranks.ts`, `RankBadge`): Bronze (início, 1000) · Silver 1050+ · Gold 1150+ · Platinum 1300+ · Diamond 1450+. Aparecem no ranking, no perfil, na página pública e no resultado da batalha.
- **Ranked** (liga `RANKED` em `battleConfig.ts`, `resolveRankedBattle` em `battleService.ts`): o adversário é o **time ativo salvo** de um jogador com rating próximo (±100, abrindo para ±200, ±400 e qualquer um), pulando os últimos 3 adversários quando dá e contas sem nome de usuário. O dono do time não precisa estar online; o time dele luta descansado e não gasta stamina.
  - Os **dois ratings mudam** (ELO); a batalha conta no `recompute-ratings` (não é `isRandom`).
  - Recompensa: 60 BITS / 100 XP na vitória, 10 / 30 na derrota (+ zebra). Quem defende ganha **20 BITS** quando o time segura (`RANKED_DEFENSE_WIN_BITS`) e sempre recebe uma notificação com a variação de rating.
  - Tela de resultado: "Ranked vs <jogador> · 1000 → 1016 (+16) · <elo>".
- O seletor de ligas virou 6 colunas; botão e confirmação dizem "Battle Ranked". Notificações viraram um helper comum (`src/lib/notifications.ts`).
- Corrigido: o pulso das sinergias no montador de time lançava erro do framer-motion (spring com 3 keyframes).

### Onda 5 — temporadas (PR #45)
- **Temporada = mês do calendário (UTC)** (`Season`, migração `20261024000000_seasons`, que abre a temporada 1 no deploy até o dia 1º do mês seguinte).
- **Promoção:** a primeira vez que o pico da temporada passa de um elo paga Silver +100 · Gold +200 · Platinum +400 · Diamond +800 BITS, com notificação (`recordSeasonProgress`, chamado dentro do `applyPvpRating`, que também conta as batalhas PvP e o pico da temporada no `User`).
- **Fim da temporada** (`closeDueSeasons` em `seasonService.ts`): quem jogou PvP na temporada ganha pelo **pico** (Bronze +100 · Silver +200 · Gold +400 · Platinum +700 · Diamond +1200), o resultado fica em `SeasonResult` (no perfil: "S1 Gold"), e todo rating volta **metade** do caminho até 1000. Abre a próxima temporada.
  - Sem cron novo: fecha quando alguém abre o ranking, joga Ranked/desafio, ou no cron diário que já existe. Idempotente (linha da temporada travada e conferida).
- **Interface:** faixa da temporada no ranking (tempo restante, seu pico, tabela de recompensas), temporadas passadas no perfil e na página pública, regra na wiki.
- **Partidas de colocação** ficaram para depois: mudam o K por jogador e quebrariam o `recompute-ratings`.

### Onda 5 — desafios melhores (PR #46)
- **Só entre amigos:** a API passou a exigir amizade aceita no desafio direto (antes só a interface filtrava).
- **Desafio por link:** "Anyone with a link" no modal de amigo cria um desafio aberto (`Battle.isOpen`, sem defensor); a página pública `/challenge/<id>` mostra quem desafia, as raridades do time, a aposta e o botão de aceitar (ou criar conta). O primeiro a aceitar leva (`joinChallenge`, atômico).
- **Aposta** (`Battle.stake`, 0–500 BITS, migração `20261025000000_challenge_stakes`): quem desafia paga ao criar, quem aceita paga ao aceitar, o vencedor leva o dobro (`challenge_payout`). Expirado ou cancelado devolve (`challenge_refund`); se a batalha falhar depois do aceite, a aposta de quem aceitou volta. Tudo pelo histórico de BITS.
- **Cancelar** desafio pendente (DELETE, com reembolso) e **copiar link** na lista de enviados; **Rematch** no histórico abre o desafio contra o mesmo jogador com a mesma aposta.
- `challengeService.ts`: `parseStake`, `areFriends`, `expireChallenges` (com reembolso, uma vez só), `cancelChallenge`, `joinChallenge` / `releaseDefender`.

### Onda 6 — a Torre (PR #47)
- **10 andares** (`TOWER_FLOORS` em `tower.ts`): de 3 Commons até 3 Legendaries, mini-chefe no 5 e chefe final no 10 (os Legendaries mais fortes do tema).
- **Semana temática** (segunda 00:00 UTC): "The Rust Gauntlet", "The Python Gauntlet"… em rodízio (`TOWER_THEMES`). Os times de cada andar são sorteados uma vez por semana com semente e guardados (`TowerFloorTeam`), iguais para todos; você vê os adversários antes de lutar.
- **Progresso** (`TowerRun`, migração `20261026000000_tower`): sempre o próximo andar; o primeiro clear da semana paga os BITS do andar (`tower_reward`, pelo histórico); tentativas ilimitadas, só custam stamina. **Ranking semanal**: andar mais alto, depois menos tentativas.
- **Aba "Tower" na Arena** (`TowerPanel`), reaproveitando o montador de time (nova prop `quickAction`) e a replay; a validação do time saiu da rota de batalha para `src/lib/playerTeam.ts`.

### Onda 6 — Sprints 🅶 (PR #49)
- **Dois Sprints com tema** (`src/lib/sprints.ts`): o **diário** (meia-noite a meia-noite UTC) com uma linguagem em rodízio (`DAILY_SPRINT_LANGUAGES`, 15) e o **semanal** (segunda a segunda) com uma família de linguagens (`WEEKLY_SPRINT_FAMILIES`: Web, Sistemas, Dados, JVM & .NET, Scripting, Mobile).
- **O jogador não monta nada:** a pontuação é a soma de ATK+DEF+HP das **3 melhores** cartas dele no tema (`SPRINT_TEAM_SIZE`), calculada na hora num SQL só (`sprintStandings` em `sprintService.ts`). Só contam cartas que ele tinha antes do fim, então fechar atrasado não muda nada. Empates dividem a posição (1, 1, 3; `rankWithTies`).
- **Fechamento** (`closeDueSprints`): paga cada posição da tabela `SPRINT_REWARDS` pelo `addBits` (`sprint_reward`), guarda as 100 primeiras posições em `SprintResult` e notifica quem ganhou. Idempotente (linha do Sprint travada e conferida). Migração `20261027000000_sprints` (`Sprint`, `SprintResult`).
  - Sem cron novo: a linha do Sprint (com o tema) nasce na primeira visita ou no cron diário, que também fecha os vencidos (`maintainSprints`). Fecha também quando alguém abre a aba.
- **Interface:** aba **"Sprints"** no ranking (`SprintBoard`): tema, tempo restante, tabela de BITS, sua posição e "+N BITS se acabar agora", as 3 cartas que contam, os boosters com cartas do tema, o top 20 ao vivo e o resultado do Sprint anterior. Wiki e tela de boas-vindas explicam a regra com os números das constantes.

### Onda 6 — eventos semanais (PR #50)
- **Pack do evento** (`EVENT_PACKS` em `packDefinitions.ts`, regras em `weeklyEvents.ts`): um por tema do Sprint semanal ("Web Week Pack", "Scripting Week Pack"…), com o filtro das linguagens do tema; dentro dele o sorteio continua uniforme (regra de ouro 1). Só o da semana aparece na loja (aba **Weekly Event**, primeira e aberta por padrão, com "On sale for 4d 22h"); a rota de compra recusa os outros com 410. Quem comprou abre depois da semana sem problema (`getPackById` acha todos).
  - A reserva só é preenchida para o pack desta semana e o da próxima (`upcomingEventPackIds`), no cron e depois de cada abertura, para não gastar cota do GitHub com os outros quatro.
- **Dev da Semana**: na primeira visita da semana (ou no cron), sorteia uma carta do tema já existente no jogo, Rare ou melhor, e guarda na linha do Sprint semanal (`Sprint.featuredDev`, migração `20261028000000_weekly_events`; só grava se ainda estiver vazio, então dois pedidos juntos concordam). Na forja custa metade (fragmentos e BITS) até a semana acabar; a busca mostra o preço cheio riscado e o histórico marca "(Dev of the Week)".
- **Interface:** destaque na forja (`/forge?dev=<login>` já abre a busca), linha do evento no quadro do Sprint semanal com links para o pack e para a forja, e seção "Weekly events" na wiki com os números das constantes.

### Onda 6 — treino de cartas (PR #51)
- **Regras** em `src/lib/training.ts`: cada nível dá +2% de ATK, DEF e HP na batalha, por cima da fidelidade (`UserCard.trainingLevel`, migração `20261029000000_card_training`). Não mexe na fórmula de geração, então o `STAT_VERSION` não muda.
  - Teto por raridade: Commons vão mais longe. Os números saíram do simulador: com o teto de 10/8/6/5/4 que eu tinha pensado, um Uncommon treinado vencia um Rare sem treino 66% das vezes. Com 8/4/4/3/3, um time totalmente treinado fica entre 37% e 57% contra a raridade de cima e vence ~70% da própria raridade sem treino.
  - Custo: BITS + fragmentos da linguagem da carta (coringas cobrem o resto), a mesma moeda em que as repetidas viram. Nível n custa n passos.
- **Batalha:** o `resolve3v3Battle` aplica o treino junto com a fidelidade; o nível chega por todos os caminhos (PvE, Ranked e o time fantasma, Torre, desafios entre amigos e por link). O teto da Liga Balanced continua no poder base.
- **Rota** `POST /api/collection/train`: confere e paga tudo dentro do `withUserLock`, com histórico de BITS (`card_training`) e de fragmentos.
- **Interface:** painel "Training" no detalhe da carta na coleção (nível, barra, status antes → depois, custo e botão) e selo "+N%" na lista. Wiki explica com os números das constantes.
- **Simulador:** nova seção "Fully trained team vs untrained" e um teste que segura o treino dentro da faixa.
- **Download da carta em PNG** (pedido do dono): botão "Download PNG" no bloco da carta Signature do perfil e "PNG" no detalhe de qualquer carta na coleção (`CardDownloadButton`, usa a rota `/api/card-image/<login>` que já existia).

### Onda 6 — coleções e cosméticos (PR #52)
- **Coleções por linguagem** (`src/lib/collections.ts`): como os packs sorteiam do GitHub inteiro, não existe "elenco do pack" para completar. Cada linguagem de combate (18) vira uma coleção com 5 vagas, uma por raridade; a Forja preenche qualquer vaga. Painel **"Language sets"** na coleção, com as gemas de raridade e a %.
- **Títulos e molduras de avatar**, liberados por nível e por coleções completas. Nada é gravado como "desbloqueado": cartas nunca saem da coleção e o nível nunca cai, então o desbloqueio é calculado na hora. Só fica gravado o que está equipado (`User.title`, `User.frame`, migração `20261030000000_profile_cosmetics`).
- **Seletor "Title & frame"** no próprio perfil (`GET/POST /api/profile/cosmetics`; a rota recusa com 403 o que ainda está bloqueado). O título aparece abaixo do nome e a moldura em volta do avatar, no perfil e na página pública `/u/<username>`, junto com "N/18 sets".
- Wiki explica com os números das constantes.
- **Bug corrigido de passagem:** o mapa de IDs antigos do inventário trocava `the-fossils` (o ID real do The Fossils, que vem nas recompensas de nível) por `fossils`, que não existe, e o pack abria como genérico. Agora o mapa faz o caminho inverso e conserta quem já foi afetado.

### Onda 7 — celular (PR #53)
- **Barra de abas inferior** em telas menores que 1024px (`Navbar.tsx`): Gacha, Packs, Cards, Battle e "More", que abre o menu com todas as páginas (o botão de menu do topo saiu). Respeita a área segura do iPhone (`viewport-fit=cover`).
  - A variável CSS `--bottom-nav-h` (`globals.css`) dá espaço embaixo do conteúdo e sobe o que é fixo no rodapé: a lista "Getting started", os avisos de notificação e o aviso de compra da loja. No desktop vale 0.
- **PWA:** `src/app/manifest.ts` (abre na loja, tela cheia, atalhos para packs, batalha e coleção), ícones 192/512, "maskable" e o da Apple, gerados do `icon.svg` por `scripts/build-app-icons.mjs`; `theme-color` e metadados de app no iPhone. Sem service worker: o Chrome não exige mais um para instalar, e um cache mal feito mostraria dados velhos do jogo.
- **Vazamento lateral:** varri as páginas principais em 375px e 320px. Vazavam as abas da Forja e da Arena (agora quebram linha ou rolam) e a tabela de stamina da Wiki (agora rola dentro do quadro, como as outras).

### Onda 7 — acessibilidade (PR #54)
- **Modais** (`src/lib/useDialog.ts`): um hook único com o comportamento de diálogo do WAI-ARIA. Esc fecha, Tab e Shift+Tab ficam presos dentro, o foco entra ao abrir e volta para quem abriu ao fechar (lembrado num listener global, porque um `autoFocus` dentro do modal roubava o foco antes do efeito). Aplicado aos 14 modais: menu do celular, painel de BITS, compra de pack, abrir pack, carta da coleção, changelog, comparar coleções, editar perfil, os três do montador de time, boas-vindas, level up e apelido (esses dois últimos sem Esc, porque o jogador precisa concluir). Todos com `role="dialog"`, `aria-modal` e título ligado.
  - O BoosterReveal e a tela de batalha ocupam a tela inteira como fluxos, não modais; ficaram como estavam.
- **Teclado:** packs da loja e do inventário e as cartas da grade da coleção usam `pressable()` (botão com Enter/Espaço); as linhas da tabela da coleção abrem com Enter/Espaço sem perder a semântica de tabela. Anel de foco visível padrão em tudo que recebe teclado (`globals.css`). Botões só com ícone ganharam `aria-label` (páginas da coleção, remover do time, buscar na forja, ordenar na Arena); uma varredura nas páginas principais não acha mais controles sem nome.
- **Contraste AA:** o `slate-500` (texto secundário em 196 lugares) foi de 57% para 64% de luminosidade: 5,9:1 no fundo e 5,4:1 nos painéis (antes 4,5 e 4,1). Os textos em `slate-600` (2,8:1) passaram para `slate-500`.
- **Som:** botão de som no topo com volume (salvo no navegador) e mudo, ligado ao ganho mestre do `audioManager`. Epic e Legendary ganharam sons próprios sintetizados por cima do de Rare: arpejo subindo no Epic, arpejo com acorde sustentado e brilho no Legendary.

### Onda 7 — PT-BR, parte 1 (PR #55)
- **Infra** (`src/i18n`): next-intl 4.14.7 sem prefixo na URL. O idioma vem do cookie `NEXT_LOCALE` ou, no primeiro acesso, do `Accept-Language` do navegador. Mensagens em `messages/<idioma>/<área>.json`, um arquivo por área (15 namespaces, os da parte 2 e 3 já criados vazios), importadas estaticamente.
  - **As chaves são tipadas a partir do inglês** (`global.d.ts`): chave errada quebra o `tsc`. O português precisa ter as mesmas chaves, e o `messages.test.ts` confere chaves, campos `{variáveis}` e textos vazios nos dois idiomas.
- **Seletor de idioma** ("EN"/"PT") no topo, no menu do celular e para visitantes.
- **Traduzido nesta parte (~460 textos):** topo, barra de abas e painel de BITS; som; loja (calendário, chances, compra, categorias, missões); inventário, abertura de packs e o minigame; coleção (tabela, carta, lealdade, treino, coleções por linguagem, títulos e molduras); Forja; boas-vindas, primeiros passos, apelido, level up; notificações e novidades; a carta e os botões de compartilhar. Números seguem o idioma (1.000 em PT).
- **Topo em telas médias:** o topo já vazava em 1280px antes desta rodada (1462px de conteúdo em 1265). Agora o menu completo aparece a partir de 1280px, com links mais juntos e sem os textos "Novidades"/nome de usuário abaixo de 1536px; abaixo de 1280px valem a barra de abas e o menu "Mais".
- **Ainda em inglês** (partes 2 e 3): as outras telas e os textos que vêm dos dados do jogo (nomes de packs, missões, conquistas, passos do "Primeiros passos", raridades, mensagens das APIs).

### Infra (PR #25)
- Build seguro: os previews não tocam o banco; as migrações vão pela conexão direta, e só quando há alguma pendente.

### CI e backup (PR #35)
- **CI** (`.github/workflows/ci.yml`): em todo PR e push na `main`, roda `tsc`, lint, `npm test` e `next build`, sem banco.
- **Orçamento de lint** (`scripts/lint-budget.mjs`): reprova só se o número de erros passar do orçamento. Baixar o número sempre que cair.
- **Backup diário** 🅶 (`.github/workflows/backup.yml`): `pg_dump` da produção, gzip e criptografia com age antes de tocar o disco; artifact por 30 dias. Configuração e restauração em [`docs/backup.md`](docs/backup.md).

---

## 📋 Backlog pendente

### Pontas soltas conhecidas (pequenas)
| Item | Prioridade | Esforço |
|---|---|---|
| Liga Diversity paga 120 sem teto de força (3 Legendaries de linguagens diferentes valem) — avaliar junto com a economia | 🟢 | P |
| Pedir ao suporte do GitHub a remoção das refs internas das PRs #1–#18 (ainda guardam o `dev.db` antigo) | 🟡 | P |
| Suíte de testes lenta (~90 s, simulador) — separar testes rápidos e lentos | 🟢 | P |

### 2.4 Economia e progressão (restante)
| Item | Esforço |
|---|---|
| ~~Níveis desbloqueiam algo além de packs~~ | ✅ títulos e molduras (PR #52) |

### 2.5 UX geral
| Item | Esforço |
|---|---|
| Notificações: limitar e limpar a lista, que cresce sem fim | P |
| **Português (PT-BR)** com next-intl, mantendo o inglês | parte 1 ✅ (PR #55); partes 2 e 3 pendentes |

### 2.6 Áudio (restante)
| Item | Esforço |
|---|---|
| ~~Slider de volume~~ | ✅ PR #54 (botão de som no topo) |
| ~~Sons próprios de Epic/Legendary~~ | ✅ PR #54 (sintetizados) · falta só a música curta de batalha | P |

### 2.7 Acessibilidade e mobile
| Item | Esforço |
|---|---|
| ~~Packs e cartas como botões, `aria-label`, foco preso e Esc nos modais~~ | ✅ PR #54 |
| ~~Contraste AA~~ | ✅ PR #54 |
| ~~Carta com tamanho responsivo~~ | ✅ não precisou: com 256px a carta cabe até em 320px; o que vazava eram abas e uma tabela (PR #53) |
| ~~Barra de abas inferior no celular~~ | ✅ PR #53 |
| ~~PWA (instalar na tela inicial)~~ | ✅ PR #53 (manifest e ícones; sem service worker) |

### 2.8 Engenharia
| Item | Esforço |
|---|---|
| Testes de concorrência (compra, abertura, daily, desafio) contra a branch dev | M |
| Mover JSON (inventário, notificações, fragmentos) para tabelas próprias | G |
| Índices restantes: `Battle(defenderId,status)`, `Battle(challengerId)`, `Friendship(friendId,status)`, `Card(rarity,primaryLanguage)` | P |
| `select` nas consultas quentes (rotas ainda carregam banner em base64 e hash da senha) | P |
| Validação com zod em todas as rotas | M |
| Sentry/logs estruturados + registrar os headers de limite do GitHub | P |
| `next.config.ts`: otimização de imagens e headers de segurança (CSP) | P |
| Reduzir os 109 erros de lint (quase todos `any`) | M |
| Migrar `middleware.ts` para `proxy.ts` (aviso do Next 16) | P |
| Atualizar Prisma 6 → 7/8 e next-auth v4 → Auth.js v5 (planejar) | M |

---

## 🟢 Fase 3 — Novas features

### 3.1 Competitivo
| Feature | Descrição | Esforço |
|---|---|---|
| **Partidas de colocação** | As temporadas existem (PR #45). Falta: K maior nas primeiras partidas da temporada; exige o `recompute-ratings` entender temporadas | P |
| **Melhor de 3** | Os desafios já têm link, aposta e revanche (PR #46). Falta a série melhor de 3 | M |
| **Escolhas táticas na batalha** | Antes de cada confronto, trocar a carta ou escolher uma postura (Agressivo / Defensivo / Habilidade) | G |

### 3.2 Modos de jogo
| Feature | Descrição | Esforço |
|---|---|---|
| **Liga pessoal estilo Cartola** | Elenco de 5 devs com orçamento; pontos semanais vêm da atividade **real** no GitHub (commits, estrelas, PRs); ligas privadas com amigos | G |
| ~~**Eventos semanais**~~ | ✅ PR #50 (pack do evento e Dev da Semana). Rate-up ficou nas decisões pendentes | — |
| ~~**Sprints 🅶**~~ | ✅ PR #49 (diário por linguagem, semanal por família). Tema de org (Big Tech) só quando houver mais cartas de membros de orgs | — |

### 3.3 Cartas e coleção
| Feature | Descrição | Esforço |
|---|---|---|
| ~~**Treinar cartas**~~ | ✅ PR #51 | — |
| ~~**Coleções/sets**~~ | ✅ PR #52 (por linguagem, uma vaga por raridade) | — |
| **Wishlist ativa** | Itens da wishlist com chance levemente maior (cuidado com a regra de ouro 1: seria um viés explícito e anunciado) | P |
| **Carta "viva"** | Atualizar status periodicamente conforme o dev real evolui. Padrão do GitPacks 🅶: a cada requisição, tentar pegar uma vaga global (`UPDATE … WHERE updated_at < agora-5min RETURNING`) e atualizar **a carta mais desatualizada**, em rodízio, sem cron. Respeitar a regra 4 (`STAT_VERSION`) | M |

### 3.4 Social
| Feature | Descrição | Esforço |
|---|---|---|
| Presentear cartas | Só cartas ganhas, com taxa em BITS | M |
| Trocas entre jogadores | Depois do presente; sem valor em dinheiro | G |
| Feed de atividade de amigos | "Fulano tirou uma Legendary" | M |

### 3.5 Visual de batalha
| Feature | Descrição | Esforço |
|---|---|---|
| Animações de combate | Avanço, pausa no impacto, tremida de tela, KO se desfazendo, barra de HP com rastro | M |
| Replay de batalha | Assistir de novo / compartilhar | M |

---

## 🟢 Fase 4 — Monetização (só depois da Fase 3 e do histórico de BITS)

> **Atenção legal (confirmar com advogado antes):**
> - Lei 15.211/2025 (ECA Digital) proíbe loot boxes em jogos voltados ou acessíveis a menores → vender **packs aleatórios por dinheiro real** exige verificação de idade, ou simplesmente não fazer.
> - CDC: transparência de odds e preço, e direito de arrependimento de 7 dias.
> - Sem saque/troca por dinheiro, para não cair na regulação de apostas (Lei 14.790/2023).
> - As cartas usam nome e foto de pessoas reais: monetizar isso tem risco de direito de imagem e LGPD. Oferecer opt-out/remoção para os devs.

| Item | Esforço |
|---|---|
| ~~Pré-requisito: histórico de transações de BITS~~ ✅ (PR #43) | — |
| Pix (Mercado Pago / Pagar.me) ou Stripe, com webhook idempotente | M |
| Vender cosméticos, passe de temporada premium e itens diretos — não packs aleatórios | M |
| Passe de temporada (trilha grátis + premium), junto com o sistema de elos | G |
| Página para devs pedirem a remoção da própria carta | P |

---

## Lista original de ideias → status

| Ideia | Status |
|---|---|
| Revelação uma carta por vez (Pokémon/MTG) | ✅ pack físico (2.1) e rasgável (PR #31) |
| Verificar se a API está funcionando / mesmos devs | ✅ sorteio uniforme (1.1) |
| O que fazer quando o usuário não tem fragmentos (Keslley) | ✅ fragmento coringa (PR #41) |
| Sistema de elos | ✅ elos, Ranked e temporadas (PR #44, #45) |
| Sincronizar BITS | ✅ |
| Métodos de pagamento | pendente (Fase 4) |
| Treinar as cartas | ✅ treino com BITS + fragmentos (PR #51) |
| Melhorar os desafios | ✅ bugs, só amigos, link, aposta, revanche, cancelar (PR #46); melhor de 3 no backlog |
| Arrumar o ranking | ✅ |
| Efeitos sonoros | ✅ booster/batalha; sons próprios pendentes (2.6) |
| Modo torre (Mortal Kombat) | ✅ Torre semanal (PR #47) |
| Melhorar as missões | ✅ diárias, semanais, de dev pelo GitHub e troca diária |
| Ligas pessoais tipo Cartola | pendente (3.2) |
| Áudio da batalha só inicia após clicar no som | ✅ |
| Melhorar os achievements | ✅ |
| "Tap to reveal" em cima dos status | ✅ |