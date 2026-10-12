# GitGacha — Roadmap

> Começou com uma auditoria em 12/10/2026 (gameplay, economia, visual/UX e engenharia), juntando a lista `Ideias de melhorias GitGatcha.txt`.
> Atualizado em 16/10/2026, ao fim das rodadas Fase 0, Fase 1 e Fase 2 (PRs #19–#26).
> Inclui as ideias tiradas do **GitPacks**, jogo parecido (MIT), marcadas com 🅶. Análise completa e links para o código dele em [`docs/analise-gitpacks.md`](docs/analise-gitpacks.md).

**Legenda:** 🔴 P0 urgente · 🟠 P1 quebrado · 🟡 P2 melhoria importante · 🟢 P3 feature nova
**Esforço:** P = horas a 1 dia · M = alguns dias · G = 1 semana ou mais

---

## 👉 Como continuar (leia primeiro)

### Estado atual
- **Tudo do backlog das Fases 0, 1 e 2.1–2.4 está entregue e em produção** (`main`, deploy na Vercel em git-gacha.vercel.app).
- 20 jogadores, ~740 cartas únicas, ~880 cartas em coleções. 6 migrações aplicadas, todas aditivas.
- 125 testes (`npm test`), `tsc` sem erros, lint com 109 erros (quase todos `any` antigos).

### Ambiente
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
3. **Moeda e campos JSON do usuário só mudam dentro de `withUserLock`** (`src/lib/userLock.ts`). Nada lento, como chamadas ao GitHub, dentro da trava.
4. **Ao mudar a fórmula de status, os multiplicadores ou as regras do pool**, subir `STAT_VERSION` (`src/lib/cardStats.ts`) e rodar `scripts/recalculate-cards.ts --apply` logo depois do deploy.
5. **Escrita em produção só com aprovação do dono** e sempre com `--env-file=.env.prod`. Migrações devem ser aditivas; o deploy de produção as aplica.
6. Números de jogo vivem em `src/lib/rarity.ts`, `battleConfig.ts`, `cardStats.ts`, `loginCalendar.ts`, `pity.ts` e `achievementUtils.ts`. A **wiki é gerada deles**; não duplicar números na UI.

### Scripts úteis
| Comando | Para quê |
|---|---|
| `npm test` | Testes puros, sem banco nem rede (~90 s, por causa do simulador) |
| `node --import tsx scripts/balance-sim.ts [seed] [fame\|impact]` | Simulador de balanceamento |
| `node --import tsx scripts/stat-examples.ts` | Status de devs conhecidos nas duas fórmulas |
| `node --env-file=.env.prod --import tsx scripts/recalculate-cards.ts [--apply] [--only=a,b]` | Recalcula cartas; contas apagadas recebem a mediana da raridade |
| `node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts [--apply]` | Refaz ratings pelo histórico PvP |
| `node --env-file=.env.prod --import tsx scripts/dedupe-user-cards.ts [--apply]` | Junta cartas duplicadas, que viram fragmentos |
| `node --env-file=.env.prod scripts/seed-changelog.js` | Seed do changelog (cria entradas novas) |

### Próximos passos sugeridos (em ordem)
1. **Onboarding para jogador novo (2.5):** pack inicial, tour de 4 passos ligado às primeiras missões, **pack de visitante sem cadastro** e tela de boas-vindas 🅶. Com o dev branch dá para testar no navegador, logado.
2. **Rodada de crescimento 🅶:** carta compartilhável com imagem de preview, "Copiar para o README" da carta Signature (3.4) e indicação de amigos (3.4).
3. **Missões de dev pelo GitHub (2.4)** e **títulos nas cartas (3.3)** 🅶: pequenos, cabem numa rodada.
4. **Sistema de elos com temporadas (3.1)**, junto com o **PvP assíncrono "fantasma" (3.1)**, que dá sentido ao rating.
5. **Torre estilo Mortal Kombat (3.2):** reaproveita `resolve3v3Battle`.
6. **CI no GitHub Actions (2.8)** junto com o **backup diário do banco** 🅶, para os PRs rodarem `tsc`, lint, testes e build sozinhos.
7. **Tradução para português (2.5)**, a liga estilo Cartola (3.2) e o resto das Fases 3 e 4.

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

### Identidade visual
- **Logo** (`src/components/Logo.tsx`): cápsula de gacha cortada pela linha de commits; o botão é um commit. Favicon em `src/app/icon.svg`.
- **Paleta e fontes** (`globals.css`, `layout.tsx`): as escalas `slate` e `indigo` do Tailwind foram retingidas (tinta violeta e violeta da marca), então todo o jogo mudou sem mexer em cada tela. Marca `brand-a/brand-b` (#7C4DFF → #FF4FA3), `commit` (#3DDC97). Fontes: Unbounded (logo/títulos), Chakra Petch (interface), JetBrains Mono (números), Caveat (autógrafo).
- **Carta nova** (`Card.tsx` + `.gg-*` no `globals.css`): cantos chanfrados, material por raridade (Epic/Legendary com moldura girando), trilha de commits de 1 a 5 nós como raridade, hash de série, emblema de linguagem, **passiva escrita na carta** (`cardPassive` em `battleConfig.ts`, mesmos números da wiki), flavor como mensagem de commit, 3D seguindo o mouse. Título provisório "linguagem + patente" (`cardVisuals.ts`) até existirem títulos por dados reais.
- **Booster:** verso e arte do pack com o logo. Galeria só de desenvolvimento em `/dev/cards` (404 em produção). Proposta original em `docs/visual-proposta.html`.

### Infra (PR #25)
- Build seguro: os previews não tocam o banco; as migrações vão pela conexão direta, e só quando há alguma pendente.

---

## 📋 Backlog pendente

### Pontas soltas conhecidas (pequenas)
| Item | Prioridade | Esforço |
|---|---|---|
| Taxa da liga Legendary só é devolvida em `NoOpponentError`. Um erro inesperado depois da cobrança fica com os 500 BITS (`api/battle/route.ts`) | 🟠 | P |
| Abertura de pack que retorna 0 cartas mostra erro e não devolve o pack | 🟠 | P |
| `processPostBattleCardStats` lê e grava `loyaltyCount` sem trava (batalhas paralelas com a mesma carta perdem incremento) | 🟡 | P |
| Pity: um pack aberto em paralelo com o pack do pity pode perder o +1 (a favor do jogador) | 🟢 | P |
| Escudo do Rust × Primeiro golpe do Go depende de quem é desafiante (assimetria). O escudo também é consumido por um erro do CSS | 🟡 | P |
| Sinergia de 3 Python não tem efeito (só vale para colegas não-Python) | 🟡 | P |
| Common × Uncommon = 83% (a faixa Common é de contas quase vazias) — avaliar | 🟡 | P |
| Recompensas escalando pela força do oponente (os parâmetros de "upset" existem e não são usados); liga Diversity paga 120 sem teto | 🟡 | P |
| Contagem regressiva das missões trava se o relógio do cliente estiver adiantado | 🟢 | P |
| Inclinação no iOS precisa pedir permissão (`DeviceOrientationEvent.requestPermission`) | 🟢 | P |
| `resolve3v3Battle` tem 3 cartas fixas por time (`cIdx < 3`) | 🟢 | P |
| Pedir ao suporte do GitHub a remoção das refs internas das PRs #1–#18 (ainda guardam o `dev.db` antigo) | 🟡 | P |
| Suíte de testes lenta (~90 s, simulador) — separar testes rápidos e lentos | 🟢 | P |

### 2.4 Economia e progressão (restante)
| Item | Esforço |
|---|---|
| Missões semanais, botão de resgatar e 1 troca por dia | M |
| **Alívio de fragmentos:** fragmento coringa (troca 3:1), escolher a linguagem do drop, wishlist aumenta chance. Resolve "usuário sem fragmentos (caso Keslley)" | P |
| **Comprar carta da wishlist 🅶** ("cherry-pick"): fragmentos compram um dev **específico**, a ~5× o valor de reciclagem. Só devs que já existem em `Card` ou que já saíram para o jogador (evita "compre o Torvalds"). É compra, não sorteio, então não fere a regra 1. Depende de "Contar duplicatas" | P |
| **Missões de dev 🅶:** grupo de missões diárias para quem conectou o GitHub — commit, abrir PR/issue, revisar PR ou comentar hoje. Uma chamada a `GET /users/{login}/events/public`; **verificar de novo no resgate** (anti-trapaça). Só eventos públicos, a API pode atrasar algumas horas. Protótipo dos dados da liga estilo Cartola | P |
| Shiny também pode sair em duplicatas | P |
| Contar duplicatas (`UserCard.quantity` nunca incrementa; "Total Pulls" = cartas únicas) | P |
| Níveis desbloqueiam algo além de packs (modos, molduras, títulos) | M |
| Histórico de BITS (tabela de transações), base para auditoria e pagamento | M |

### 2.5 UX geral
| Item | Esforço |
|---|---|
| **Onboarding:** pack inicial + tour de 4 passos (abrir pack → coleção → time → primeira batalha), ligado às primeiras missões | M |
| **Pack de visitante 🅶:** 1 booster sem cadastro (cookie + limite por IP com `RateLimitHit`); ao se cadastrar, as cartas vão para a conta. Consome a reserva do booster | P |
| **Tela de boas-vindas 🅶:** no primeiro login, lista todas as formas de ganhar BITS e packs (daily, missões, calendário, conquistas, indicação, compartilhar) | P |
| Confirmação de compra com odds e "Abrir agora" direto do toast (o CDC exige transparência das odds) | P |
| Estados vazios com ação (Coleção, Forja sem fragmentos, Amigos, Histórico) | P |
| Skeleton de carregamento na loja | P |
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
| **CI no GitHub Actions:** `tsc`, `eslint`, testes e `next build` | P |
| **Backup diário do banco 🅶:** workflow com `pg_dump` + gzip, retenção de 30 dias. A janela de restauração do Neon no plano grátis é curta. ⚠️ Não usar *artifacts* do Actions se o repo for público (o dump tem e-mails e hashes): mandar para armazenamento privado ou criptografar com chave em secret | P |
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
| **Ranking Colecionador 🅶** | Segunda aba do ranking por pontos de coleção (cartas únicas ponderadas por raridade, bônus por set). Dá lugar a quem não joga PvP | P |

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
| **Títulos e habilidades 🅶** | Título e frase por status dominante e raridade, com os dados que já temos (muitas estrelas → "Star Magnet", conta antiga → "Veterano", muitos repos → "Prolífico", linguagem). Só cosmético, não sobe `STAT_VERSION` | P |

### 3.4 Social
| Feature | Descrição | Esforço |
|---|---|---|
| Presentear cartas | Só cartas ganhas, com taxa em BITS | M |
| Trocas entre jogadores | Depois do presente; sem valor em dinheiro | G |
| **Carta e perfil compartilháveis 🅶** | Página pública por carta e por perfil com `og:image` (PNG gerado com `ImageResponse` de `next/og`), botões Compartilhar no X / Copiar link. **"Copiar para o README"** da carta Signature: markdown `[![card](png)](link)` para o README do perfil do GitHub — divulgação grátis. Recompensa única por compartilhar | P |
| **Indicação de amigos 🅶** | Código = username; os dois ganham; teto de 10 por pessoa; sem autoindicação; indicado só uma vez (chave única). Pagar só quando o indicado **conectar o GitHub** (contas por e-mail facilitam fraude). Dentro de `withUserLock` | P |
| **Comparar coleção 🅶** | Em Amigos: "cartas que ele tem e você não" — prepara presentes e trocas | P |
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
| Pré-requisito: histórico de transações de BITS | M |
| Pix (Mercado Pago / Pagar.me) ou Stripe, com webhook idempotente | M |
| Vender cosméticos, passe de temporada premium e itens diretos — não packs aleatórios | M |
| Passe de temporada (trilha grátis + premium), junto com o sistema de elos | G |
| Página para devs pedirem a remoção da própria carta | P |

---

## Lista original de ideias → status

| Ideia | Status |
|---|---|
| Revelação uma carta por vez (Pokémon/MTG) | ✅ pack físico (2.1) |
| Verificar se a API está funcionando / mesmos devs | ✅ sorteio uniforme (1.1) |
| O que fazer quando o usuário não tem fragmentos (Keslley) | pendente (2.4 alívio de fragmentos) |
| Sistema de elos | pendente (3.1) — rating já está correto |
| Sincronizar BITS | ✅ |
| Métodos de pagamento | pendente (Fase 4) |
| Treinar as cartas | pendente (3.3) |
| Melhorar os desafios | ✅ bugs/exploits; resto em 3.1 |
| Arrumar o ranking | ✅ |
| Efeitos sonoros | ✅ booster/batalha; sons próprios pendentes (2.6) |
| Modo torre (Mortal Kombat) | pendente (3.2) |
| Melhorar as missões | ✅ diárias; semanais pendentes (2.4) |
| Ligas pessoais tipo Cartola | pendente (3.2) |
| Áudio da batalha só inicia após clicar no som | ✅ |
| Melhorar os achievements | ✅ |
| "Tap to reveal" em cima dos status | ✅ |