# GitGacha — Roadmap

> Começou com uma auditoria em 12/10/2026 (gameplay, economia, visual/UX e engenharia), juntando a lista `Ideias de melhorias GitGatcha.txt`.
> Atualizado em 13/10/2026, depois das rodadas de identidade visual, títulos nas cartas e booster rasgável (PRs #27–#32). O backlog está organizado em **ondas** (ver "Ondas de melhorias").
> Inclui as ideias tiradas do **GitPacks**, jogo parecido (MIT), marcadas com 🅶. Análise completa e links para o código dele em [`docs/analise-gitpacks.md`](docs/analise-gitpacks.md).

**Legenda:** 🔴 P0 urgente · 🟠 P1 quebrado · 🟡 P2 melhoria importante · 🟢 P3 feature nova
**Esforço:** P = horas a 1 dia · M = alguns dias · G = 1 semana ou mais

---

## 👉 Como continuar (leia primeiro)

### Estado atual
- **Tudo do backlog das Fases 0, 1 e 2.1–2.4 está entregue e em produção** (`main`, deploy na Vercel em git-gacha.vercel.app), mais a identidade visual, os títulos nas cartas e a abertura de booster rasgável.
- 20 jogadores, ~740 cartas únicas, ~880 cartas em coleções. 13 migrações, todas aditivas (a do histórico de BITS também grava o saldo de abertura de cada jogador).
- 167 testes (`npm test`), `tsc` sem erros, lint com 102 erros e 57 avisos (quase todos `any` antigos). O CI (GitHub Actions) roda tudo em cada PR.

### Ambiente
> Conta de teste local (branch dev): credenciais em `.env.local` (`TEST_ACCOUNT_EMAIL` / `TEST_ACCOUNT_PASSWORD`, ignorado pelo git). O login local redireciona para `NEXTAUTH_URL` (porta 3000); com o servidor na 3005, volte para a 3005 depois de entrar.

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
| `node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts [--apply]` | Refaz ratings pelo histórico PvP |
| `node --env-file=.env.prod --import tsx scripts/dedupe-user-cards.ts [--apply]` | Junta cartas duplicadas, que viram fragmentos |
| `node --env-file=.env.prod --import tsx scripts/backfill-card-profiles.ts [--apply]` | Preenche o retrato do perfil no GitHub das cartas (só as colunas de perfil; status não mudam). 2–4 chamadas REST por carta |
| `node --env-file=.env.prod scripts/seed-changelog.js` | Seed do changelog (cria entradas novas) |

---

## 🌊 Ondas de melhorias (ordem sugerida)

Cada onda junta itens do backlog abaixo que fazem sentido juntos e cabem em 1–3 rodadas (uma PR por rodada). Os números entre parênteses apontam para a seção do backlog.

| Onda | Tema | O que entra | Tamanho |
|---|---|---|---|
| **1** | 🧹 Casa arrumada | ✅ Pontas soltas (PR #34), CI e backup (PR #35), bônus por zebra (PR #36). Common × Uncommon (82%) fica como está, por decisão do dono. **Falta só o dono configurar a chave do backup** (`docs/backup.md`) | feito |
| **2** | 👋 Primeira impressão | ✅ Onboarding, pack inicial e boas-vindas (PR #37); pack de visitante, compra com odds, estados vazios e skeleton (PR #38) | feito |
| **3** | 📣 Crescimento | ✅ Compartilhar (PR #39); indicação de amigos, comparar coleção e Ranking Colecionador (PR #40) | feito |
| **4** | 🃏 Coleção e economia | ✅ Repetidas, Shiny em repetidas, coringa (PR #41); missões semanais, de dev e troca diária (PR #42); histórico de BITS (PR #43) | feito |
| **5** | ⚔️ Competitivo | **Elos com temporadas** + **PvP assíncrono "fantasma"**, desafios melhores (revanche, link, aposta) (3.1) | 2–3 rodadas, M |
| **6** | 🗼 Modos e cartas | **Torre estilo Mortal Kombat**, **Sprints** 🅶, eventos semanais (3.2); **treinar cartas**, coleções/sets, níveis que desbloqueiam algo (3.3, 2.4) | 3+ rodadas, M |
| **7** | 📱 Celular, acessibilidade e idioma | Barra de abas inferior, carta responsiva, PWA, teclado/`aria`/foco nos modais, contraste AA (2.7); slider de volume e sons próprios de Epic/Legendary (2.6); **PT-BR com next-intl** (2.5) | 2–3 rodadas, M–G |
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
| Níveis desbloqueiam algo além de packs (modos, molduras, títulos) | M |

### 2.5 UX geral
| Item | Esforço |
|---|---|
| Notificações: limitar e limpar a lista, que cresce sem fim | P |
| **Português (PT-BR)** com next-intl, mantendo o inglês | G |

### 2.6 Áudio (restante)
| Item | Esforço |
|---|---|
| Slider de volume nas configurações | P |
| Sons próprios de Epic/Legendary (hoje reaproveitam o de Rare com tom diferente) e música curta de batalha | P |

### 2.7 Acessibilidade e mobile
| Item | Esforço |
|---|---|
| Packs e cartas como botões (teclado), `aria-label`, foco preso e Esc nos modais | M |
| Contraste AA (textos slate-500/600 sobre quase preto) | P |
| Carta com tamanho responsivo (`w-[min(16rem,80vw)]`) | P |
| Barra de abas inferior no celular | M |
| PWA (instalar na tela inicial) | P |

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
| **Sistema de elos** | Bronze → Prata → Ouro → Platina → Diamante por faixa de rating, temporadas com reset suave, partidas de colocação, recompensa por promoção e por fim de temporada | M |
| **PvP assíncrono "fantasma"** | Batalhar contra o time ativo salvo de outros jogadores com rating parecido (±100) | M |
| **Desafios melhores** | Só entre amigos, revanche/melhor de 3, aposta de BITS combinada, link compartilhável | M |
| **Escolhas táticas na batalha** | Antes de cada confronto, trocar a carta ou escolher uma postura (Agressivo / Defensivo / Habilidade) | G |

### 3.2 Modos de jogo
| Feature | Descrição | Esforço |
|---|---|---|
| **Torre (estilo Mortal Kombat)** | ~10 andares de oponentes temáticos cada vez mais fortes ("Rust Gauntlet", chefe = Legendary famoso), recompensas por marco, ranking semanal | M |
| **Liga pessoal estilo Cartola** | Elenco de 5 devs com orçamento; pontos semanais vêm da atividade **real** no GitHub (commits, estrelas, PRs); ligas privadas com amigos | G |
| **Eventos semanais** | Rate-up temático, "Dev da Semana", boosters por tempo limitado | M |
| **Sprints 🅶** | Competição diária e semanal com tema (linguagem, org, "Dev da Semana") escolhido pelo cron. O jogador não monta nada: no fim, todo mundo é pontuado pelo poder das melhores cartas do tema, **calculado na hora** (não salvar escalação). Empates dividem a posição (1, 1, 3). Topo ganha BITS | M |

### 3.3 Cartas e coleção
| Feature | Descrição | Esforço |
|---|---|---|
| **Treinar cartas** | BITS + duplicatas/fragmentos sobem níveis (+2% por nível, teto por raridade) | M |
| **Coleções/sets** | Completar o elenco de um pack dá título, moldura ou banner; mostrar % por pack | M |
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
| Sistema de elos | pendente (3.1) — rating já está correto |
| Sincronizar BITS | ✅ |
| Métodos de pagamento | pendente (Fase 4) |
| Treinar as cartas | pendente (3.3) |
| Melhorar os desafios | ✅ bugs/exploits; resto em 3.1 |
| Arrumar o ranking | ✅ |
| Efeitos sonoros | ✅ booster/batalha; sons próprios pendentes (2.6) |
| Modo torre (Mortal Kombat) | pendente (3.2) |
| Melhorar as missões | ✅ diárias, semanais, de dev pelo GitHub e troca diária |
| Ligas pessoais tipo Cartola | pendente (3.2) |
| Áudio da batalha só inicia após clicar no som | ✅ |
| Melhorar os achievements | ✅ |
| "Tap to reveal" em cima dos status | ✅ |