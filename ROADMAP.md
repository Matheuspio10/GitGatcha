# GitGacha — Roadmap

> Análise feita em 12/10/2026 sobre o código do `main` (commit `275a678`), banco de produção (Neon, só leitura), API do GitHub e app rodando localmente.
> Junta a lista `Ideias de melhorias GitGatcha.txt` com uma auditoria de gameplay, economia, visual/UX e engenharia.

**Legenda**

| Prioridade | Significado |
|---|---|
| 🔴 P0 | Urgente — risco de perder dados, exploit ou segurança |
| 🟠 P1 | Quebrado — algo que o jogador percebe que não funciona |
| 🟡 P2 | Melhoria importante — deixa o jogo bem melhor |
| 🟢 P3 | Feature nova / longo prazo |

Esforço: **P** = horas a 1 dia · **M** = alguns dias · **G** = 1 semana ou mais

---

## Retrato atual (12/10/2026)

- 20 usuários, 718 cartas únicas, 866 cartas em coleções.
- Cartas no banco: 309 Common · 59 Uncommon · 110 Rare · 146 Epic · 94 Legendary.
- Tabela de reserva `BoosterFallbackDev`: **vazia** (o cron nunca rodou).
- Token do GitHub válido, sem expiração, sem escopos extras (só leitura pública). Limite: 5.000 chamadas/hora (core) e 30/min (busca), ambos renovam sozinhos.
- Testes: 6 de 7 passam. ESLint: 182 erros / 74 avisos. TypeScript: 1 erro.
- Nenhuma IA externa (Gemini, OpenAI etc.) é usada pelo app.

---

## Progresso — 12/10/2026 (branch `fase0-sorteio-justo`)

**Feito**
- ✅ **Sorteio realmente aleatório (núcleo do jogo)** — novo `src/lib/devSampler.ts`. Dentro do filtro de cada booster, todo dev da raridade sorteada tem a mesma chance, inclusive contas novas e pequenas (o próprio jogador). Três estratégias:
  - *por ID* (Common de packs amplos): sorteia um ID de conta e aceita se encaixa;
  - *por janelas de busca* (resto): fatia o GitHub em janelas de data de cadastro e só aceita a posição sorteada se a janela tiver esse tanto de devs — isso contorna o limite de 1.000 resultados sem viciar a chance;
  - *por organização* (Big Tech): membros públicos de Google, Microsoft, Meta, AWS, Apple, Netflix, GitHub, Vercel, Shopify, Stripe, OpenAI.
  - Testado com um GitHub falso (teste estatístico qui-quadrado + "todo dev elegível sai") e contra o GitHub real.
- ✅ **Raridade nova**: faixa de seguidores (0–49 Common · 50–199 Uncommon · 200–999 Rare · 1.000–4.999 Epic · 5.000+ Legendary) + bônus de 1 nível por estrelas (1k / 3k / 10k / 30k). Regra "empresa = Legendary" removida.
- ✅ **718 cartas recalculadas** com dados atuais do GitHub (711 atualizadas; 7 contas não encontradas ficaram como estavam: LingDong-, abrn, halvardssm, kamranahmedse, ValentineFernandes, numb95, Ibrahim-Al-Najjar).
- ✅ BITS, packs, daily, missões, forja, recarga de stamina, taxa da liga Legendary, resposta de desafio, notificações e resgate de recompensas agora são atômicos (trava por jogador em `src/lib/userLock.ts`). Pack que falha antes de entregar cartas é devolvido; desafio travado em "resolvendo" expira.
- ✅ `postinstall` perigoso removido; migrações do Prisma criadas (`prisma/migrations`, baseline `0_init`); build da Vercel roda `prisma migrate deploy`.
- ✅ `benchmark.ts` e `test_scaling.ts` apagados; `prisma/dev.db` removido do histórico do git (main reescrito, 18 branches antigas apagadas).
- ✅ Cron protegido (recusa sem `CRON_SECRET`) e agendado em `vercel.json` (diário); agora aquece caches, atualiza membros das orgs e preenche a reserva com devs sorteados pelo mesmo método justo.
- ✅ `/api/forge/search` exige login e valida o username; forja não cria carta duplicada e não quebra mais ao criar carta nova (bug do `topLanguages`).
- ✅ Wiki: seção de raridades gerada a partir das constantes do código (faixas, multiplicadores, chances reais).
- ✅ Testes: runner trocado para `tsx` (30 testes passando); `tsc` sem erros; lint 182 → 171 erros.

**Feito em seguida (13/10/2026)**
- ✅ **Reserva consumível** (`src/lib/boosterReserve.ts`): devs pré-sorteados pelo mesmo método justo, cada um usado uma única vez (o mais antigo primeiro) e reposto em segundo plano após cada abertura. Boosters ficam instantâneos e aguentam picos sem perder a aleatoriedade.
- ✅ **Conectar GitHub** (perfil → Edit Profile): buscas do booster usam a cota do próprio jogador; +300 BITS na primeira conexão; o jogador ganha **a própria carta na edição Signature** (moldura foil exclusiva, nunca sai em booster nem na forja).
- ✅ Cron com 300 s (Fluid compute) e carregamento das orgs retomável.

**Rodada Fase 1 (14/10/2026)**
- ✅ Login com GitHub corrigido (o GitHub passou a mandar o parâmetro `iss`, que o next-auth v4 recusava).
- ✅ 0.7 rota de login legada removida · 0.10 limite de tentativas (cadastro, login, forja, loja, daily, batalha) · 0.11 validação das imagens de perfil · 0.13 `/inventory` e `/forge` protegidos.
- ✅ 1.2 Ranking: rating só muda em PvP; desempate; só aparece quem já jogou; aba Rivais = amigos; avatares e celular. Script `scripts/recompute-ratings.ts` para refazer os ratings a partir do histórico PvP.
- ✅ 1.3 Missões diárias (renovam à meia-noite UTC, pool de 16, "Collect Rare" conta raridades maiores, contagem regressiva).
- ✅ 1.4 Batalha: stamina com piso 0 e sem "restaurar", stamina recupera para todas as cartas, desafio não expõe o time, carta não pode estar em dois desafios, oponente PvE aleatório de verdade, regra de empate única, liga Legendary paga 900 (taxa 500).
- ✅ 1.5 Booster: dica não cobre mais os status, flip 3D, carta revelada continua revelada, só avança depois de revelar. Áudio desbloqueia no primeiro clique; mute real e salvo. Toasts globais. BITS sincronizados. Loja falsa de BITS trocada por "como ganhar BITS". Level up aparece sem recarregar. Link da forja abre o pack certo na loja. Amigos no menu.
- ✅ 1.6 Wiki: ligas, recompensas, lealdade, stamina, rating e forja vêm do código (`src/lib/battleConfig.ts`); mecânicas inexistentes removidas.
- ✅ 1.7 Limpeza: 20 arquivos de log/lixo removidos, dependências não usadas removidas, `@prisma/client` em dependências, README e `.env.example`.
- Acessibilidade: respeita "reduzir movimento", zoom liberado no celular.

**Rodada Fase 2 — balanceamento e progressão (15/10/2026)**
- ✅ 2.3 Balanceamento com simulador de batalhas (`src/lib/balanceSim.ts`, `scripts/balance-sim.ts`): fórmula "fama" (status crescem com estrelas, repositórios, seguidores e idade em escala logarítmica, sem os números de centenas de milhares), DEF com mitigação percentual, 9 linguagens novas com passiva e tabela de tipos ampliada. Resultado: Legendary vence Common ~100%, raridades vizinhas 71–76%, mesma raridade ~50%.
- ✅ 2.1 Booster estilo pack físico: rasgar o pack, pilha de cartas para virar e arremessar, suspense para Epic/Legendary, "Revelar tudo", sons, pular o mini-game.
- ✅ 2.2 Molduras por raridade (aço, verde, azul com gemas, foil roxo, ouro animado), brilho holográfico que segue o mouse/inclinação para Epic+ e Shiny, texturas sem dependência externa.
- ✅ 2.4 Calendário de login de 7 dias (pack no dia 7), 10 conquistas com bronze/prata/ouro e BITS por nível, pity (Legendary garantida em até 30 packs) com contador e chances na loja.

**Pendente de ação sua**
- 🟡 Aplicar as migrações no banco de produção (`prisma migrate resolve --applied 0_init` e `prisma migrate deploy`) — cria 3 tabelas novas (`GithubCache`, `OrgMember`, `RecentPull`), sem tocar nas existentes. **O código novo precisa delas.**
- 🟡 Criar `CRON_SECRET` nas variáveis de ambiente da Vercel (sem ele o cron não roda).
- 🟡 0.2: criar uma branch de desenvolvimento no Neon e apontar o `.env.local` para ela.
- 🟡 Pedir ao suporte do GitHub a remoção das refs internas das PRs #1–#18, que ainda guardam o `dev.db` antigo.

**Descobertas novas**
- **O gargalo agora é a cota de busca do GitHub (30/min por token).** Com o cache aquecido, cada carta custa ~1 busca; um booster ~5. Quando estoura, o booster usa a reserva (devs pré-sorteados pelo cron). Para escalar: usar o token OAuth do próprio jogador (quem entra com GitHub tem cota própria) — novo item 2.8.
- **Inflação de Legendary:** depois do recálculo, o banco tem 229 Legendary (antes 94) — as cartas antigas estavam com raridade errada (versões antigas forçavam a raridade do slot). Revisar balanceamento (2.3) e a liga Legendary.
- 12 pares de cartas duplicadas (mesmo jogador, mesma carta) já existentes — precisam ser mescladas antes do item 0.12.
- `/users?since=` do GitHub devolve vazio em trechos de IDs apagados (não significa "fim"); o sorteador já trata isso.

---

## Fase 0 — Antes de qualquer feature (segurança e integridade) 🔴

Esses itens podem **apagar o banco de produção** ou permitem **duplicar BITS/packs**. Resolver primeiro.

| # | Item | Onde | Esforço |
|---|---|---|---|
| 🟡 0.1 | **Remover o `postinstall` perigoso.** Hoje todo `npm install` roda `prisma db push --accept-data-loss` contra o banco do `.env` (produção). Uma diferença de schema numa branch apaga colunas/tabelas em silêncio. Trocar por `prisma migrate` com histórico de migrações. | `package.json` | M |
| 0.2 | **Separar banco de dev e produção.** Criar uma branch do Neon para desenvolvimento; `.env.local` aponta para ela. | `.env.local` | P |
| ✅ 0.3 | **Apagar ou proteger `benchmark.ts`** — ele faz `deleteMany({})` em users, cards e battles. Rodado com o `.env` atual, zera a produção. | `benchmark.ts:90` | P |
| ✅ 0.4 | **Tirar `prisma/dev.db` do git** (contém e-mails e um hash de senha) e limpar do histórico. | `prisma/dev.db` | P |
| ✅ 0.5 | **Operações de moeda atômicas.** Compra, abertura de pack, daily, forja, recuperar stamina e resposta de desafio fazem "lê → confere → grava". Com requisições em paralelo dá para: abrir o mesmo pack N vezes, comprar com saldo negativo, coletar o daily várias vezes, receber recompensa de batalha em dobro. Usar `updateMany` com condição (`currency >= custo`, `status = PENDING`) + `increment/decrement` + `$transaction`. | `store/booster`, `inventory/open`, `economyService.ts:124`, `forge/invoke`, `collection/recover`, `battle/challenge/[id]` | M |
| ✅ 0.6 | **`grantXP` sobrescreve BITS, inventário e notificações** com valores lidos antes (`currency: user.currency + …`). Como é chamado em paralelo e sem `await` ao abrir pack, BITS gastos "voltam" e packs somem/reaparecem — acontece mesmo sem ninguém tentar trapacear. | `src/lib/xpService.ts:219-229`, `inventory/open/route.ts:47` | P |
| 0.7 | **Apagar a rota legada `/api/auth/login`.** Sem rate limit, cria conta automaticamente para qualquer username e devolve o registro inteiro do usuário (incluindo hash da senha e e-mail). Nada no app usa. | `src/app/api/auth/login/route.ts` | P |
| 🟡 0.8 | **Proteger o cron.** Sem `CRON_SECRET`, qualquer pessoa pode chamar o endpoint e gastar a cota do token. Recusar quando a variável não existir. | `api/cron/rebuild-fallback-pool/route.ts:16` | P |
| ✅ 0.9 | **Exigir login e validar username em `/api/forge/search`.** Hoje é um proxy aberto que gasta o token do servidor; um username como `../user` acessa dados da conta dona do token. Validar com `^[A-Za-z0-9-]{1,39}$`. | `forge/search/route.ts`, `githubService.ts:37` | P |
| 0.10 | **Rate limit** em login, registro, busca da forja, booster e batalha (ex.: Upstash Ratelimit no middleware). Hoje dá para criar contas em massa e farmar os 1.000 BITS iniciais. | `middleware.ts` | M |
| 0.11 | **Validar imagens de perfil.** Banner/avatar aceitam qualquer URL externa e valores `preset:`/`color:` pulam a checagem de tamanho. Aceitar só `data:image/png|jpeg|webp` com limite, ou mover para storage (Vercel Blob). | `profile/update/route.ts:36-58` | P |
| 0.12 | **Constraint única `UserCard(userId, cardId)`** — hoje dá para ter a mesma carta duplicada (forja não confere se já tem). | `prisma/schema.prisma` | P |
| 0.13 | Adicionar `/inventory` e `/forge` ao `matcher` do middleware de autenticação. | `src/middleware.ts` | P |

---

## Fase 1 — Consertar o que está quebrado 🟠

### 1.1 Sorteio de devs (o "vem sempre os mesmos devs")

Item marcado como "ok" na lista de ideias, mas **continua acontecendo**. Teste real de hoje: buscas de Legendary e Epic voltaram vazias 6 de 6 vezes.

Causas:
1. A busca junta faixa de seguidores + janela aleatória de 30 dias → Legendary/Epic têm só 0–40 resultados (1–2 páginas), mas o código sorteia página 1–5 / 1–10 → quase sempre pede página vazia (`githubService.ts:146-167`).
2. Quando vem vazio, o código **dobra** o número de páginas sorteadas (piora).
3. A raridade é recalculada pelo powerScore, que não bate com a faixa de seguidores → Uncommon e Rare se perdem.
4. Depois de 5 tentativas cai na reserva; a `BoosterFallbackDev` está vazia, então sorteia das 94 Legendary / 146 Epic que já existem → repetição.
5. A memória "não repetir" (6h por pack) fica na RAM do servidor e some a cada reinício na Vercel.

| Item | Esforço |
|---|---|
| ✅ Sortear página só entre as que existem (usar `total_count`) e remover o "dobra páginas" | P |
| ✅ Alinhar faixas de seguidores da busca com o cálculo de raridade | P |
| ✅ Criar `vercel.json` com o cron (a cada 48h) e rodar uma vez manualmente | P |
| ✅ ~~Servir boosters da reserva~~ — substituído pelo sorteio uniforme ao vivo (~1 busca por carta com cache); a reserva virou só plano B | M |
| ✅ Cache do GitHub e lista de "tirados recentemente" no banco (tabelas `GithubCache` e `RecentPull`), compartilhados entre instâncias | M |
| ✅ Corrigir a checagem "empresa = Google/Meta → Legendary": hoje `meta` casa com "Metal…" e qualquer funcionário de big tech vira Legendary 2.5× | P |

### 1.2 Ranking (o "ranking não faz sentido")

Toda batalha contra o computador **sobrescreve** o rating: vira 1031 depois de qualquer vitória e 985 depois de qualquer derrota, independente do histórico (`battleService.ts:160-185`). Por isso o ranking tem quase todos empatados em 1031 e a ordem dentro do empate é aleatória.

| Item | Esforço |
|---|---|
| Rating só muda em PvP; PvE ganha pontuação própria (ou deltas pequenos fixos) | P |
| Critério de desempate (vitórias, data) | P |
| Esconder contas de teste (`user_123`, `testuser`) do ranking | P |
| Corrigir avatares quebrados na página de ranking | P |
| Tabela do ranking estoura a largura no celular (coluna Rating cortada) | P |
| Aba "Rivais" deve listar amigos, e incluir você | P |

### 1.3 Missões e conquistas

| Item | Esforço |
|---|---|
| Missões só são criadas uma vez (quando o usuário tem zero) e nunca renovam, apesar da tela dizer "volte amanhã" (`economyService.ts:27`). Adicionar período/expiração | P |
| Missão "Coletar uma Rare" não conta Epic/Legendary; progresso aparece como "0 / Rare" | P |
| Recompensa de missão paga em dobro quando vêm 2 cartas no mesmo pack (verificações em paralelo) | P |

### 1.4 Batalha — bugs e exploits

| Item | Esforço |
|---|---|
| Time do desafiante perde o bônus de lealdade no snapshot do desafio | P |
| Stamina do desafiante é **restaurada** quando o amigo aceita (grava snapshot − 20) | P |
| Stamina do defensor pode ficar negativa; checagem de exaustão é pulada | P |
| `GET /api/battle/challenge` entrega o time completo do desafiante (dá para escolher counter pelo devtools) | P |
| Mesmo time pode estar em desafios ilimitados ao mesmo tempo | P |
| Oponente PvE são 3 linhas seguidas da tabela `Card` (sem critério, pode incluir cartas suas) | P |
| Empate no último card favorece o defensor; o failsafe de 200 turnos favorece o desafiante — escolher uma regra | P |
| Cartas no time ativo nunca recuperam stamina, e o TeamBuilder marca tudo como ativo automaticamente → força a pagar recarga | P |
| Liga Legendary custa 500 e paga 300 na vitória (sempre dá prejuízo) | P |

### 1.5 Visual/UX quebrado

| Item | Onde | Esforço |
|---|---|---|
| Texto "Tap to reveal • Swipe or click arrows" em cima dos status da carta — o card não ocupa altura no layout; trocar por coluna flex com a dica abaixo | `BoosterReveal.tsx:457-508` | P |
| A dica fala "click arrows" no celular, onde as setas estão escondidas | `BoosterReveal.tsx:469` | P |
| Flip 3D sem perspectiva — `perspective-1000`/`preserve-3d` não existem no Tailwind 4 (usar `perspective-[1000px]`, `transform-3d`) | `BoosterReveal.tsx` | P |
| Áudio da batalha só inicia depois do clique: o `AudioContext` só é criado ao clicar no som, e o ícone começa como 🔊 mas o primeiro clique **muta** → precisa clicar duas vezes. Criar e dar `resume()` no clique de "⚡ Battle!" | `useBattleAudio.ts`, `BattleClient.tsx:940` | P |
| Toasts da wishlist no Inventário nunca aparecem (`<Toaster>` só está montado na Forja) — montar um global no layout | `ForgeClient.tsx:183` | P |
| Login com senha errada não mostra mensagem | `login/page.tsx:37` | P |
| Link de recomendação da Forja (`/store?pack=`) é ignorado pela Loja | `ForgeClient.tsx:368` | P |
| `LevelUpModal` só aparece depois de recarregar a página | `LevelUpModal.tsx:24` | P |
| BITS ficam dessincronizados entre Navbar, Loja e Forja (cada um tem seu estado) — usar contexto/SWR compartilhado. Este é o item "Sincronizar BITS" | `Navbar.tsx:15`, `StoreClient.tsx:79`, `ForgeClient.tsx:48` | P |
| Loja falsa de BITS com preço em dinheiro clicável na Navbar (e erro de digitação "Aquire") | `Navbar.tsx:208-254` | P |

### 1.6 Wiki diferente do código

A wiki promete números que o código não usa. Exemplos: multiplicador de raridade (wiki 0.6–1.4× / código 0.5–2.5×), recompensas de liga (15–60 / 50–300 BITS), bônus de lealdade (+5–40% / +3–25%), crítico (documentado, não existe), XP aumenta stamina máxima (não aumenta), taxa de 500 BITS da liga Legendary (não documentada).

| Item | Esforço |
|---|---|
| 🟡 Centralizar constantes (multiplicadores, recompensas, ligas) num config único usado pelo código **e** pela wiki — feito para raridades (`src/lib/rarity.ts`); faltam ligas, recompensas e lealdade | P |

### 1.7 Engenharia

| Item | Esforço |
|---|---|
| ✅ Arrumar o runner de testes (um teste importa com `.ts`, o outro sem — trocar para vitest ou tsx) | P |
| Limpar o repositório: ~20 arquivos de log/lint/temporários versionados (`lint-results.json` tem 1,1 MB), `temp_ffmpeg/`, ajustar `.gitignore` | P |
| Dependências: `@prisma/client` está em devDependencies; `ffmpeg-static`, `jsonwebtoken`, `ts-node` não são usados | P |
| README de verdade (o atual é o padrão do Next.js) | P |

---

## Fase 2 — Melhorias de base 🟡

### 2.1 Abertura de booster (prioridade do dono)

"Revelar uma carta por vez, como num booster de Pokémon/MTG". Já existe um carrossel uma-a-uma; falta a sensação física.

| Item | Esforço |
|---|---|
| **Pilha de cartas viradas**: a de cima vira no toque, mostra NEW/DUP e som da raridade; segundo toque/swipe "arremessa" a carta para fora e revela a próxima | M |
| Só deixar avançar depois de revelar (hoje dá para pular sem ver) | P |
| Animação de **rasgar o pack** antes da primeira carta | M |
| **Suspense de raridade**: brilho de 1–2s no verso antes de virar, som crescente, flip mais lento para Epic/Legendary | P |
| Botão "Revelar tudo" e atalhos (Espaço vira, setas navegam) | P |
| Estado de "virada" não se perde ao voltar para uma carta anterior | P |
| Mini-game de hacking com opção de pular (hoje é obrigatório) | P |

### 2.2 Visual das cartas

| Item | Esforço |
|---|---|
| **Moldura própria por raridade** (borda metálica/foil, gema no canto, ícone de raridade). Hoje só muda a cor da borda e Common/Uncommon são quase iguais | M |
| O brilho por raridade está sendo anulado por um `shadow-[…rgba(0,0,0,.5)]` | P |
| **Efeito holográfico** que segue o mouse/giroscópio para Epic+ e Shiny em todas as telas, não só na abertura | M |
| Legendary com efeito mais forte que Shiny/lealdade (hoje é o contrário) | P |
| Paleta consistente entre Loja, Forja e Batalha | P |
| Hospedar localmente as texturas que vêm de transparenttextures.com | P |
| Remover restos do template (fonte Arial/Geist no `globals.css`) | P |

### 2.3 Balanceamento das cartas

| Item | Esforço |
|---|---|
| Reduzir a diferença de raridade (hoje 5× entre Common e Legendary em todos os status; a wiki diz 0.6–1.4×) | M |
| DEF percentual (`DEF/(DEF+K)`) em vez de "−0,25 por ponto" — hoje DEF quase não importa, exceto para quem tem centenas de repos, que trava lutas no piso de 15% | M |
| Tirar `3·ATK` do HP (estrelas hoje dominam ATK **e** HP) | P |
| CSS: chance de dano zero aumenta com a raridade (Legendary CSS erra mais) — inverter | P |
| Dar passiva e matchups para Java, C#, Kotlin, Swift, Shell, HTML, Dart, Jupyter (hoje a maioria das cartas é "Neutral") | P |
| Implementar sinergias Big Tech/Indie (hoje são stub) e o tipo "Legendary" (precisa de coluna `pack` em `Card`) | M |
| Recompensas escalando pela força do oponente (os parâmetros de "upset" já existem e não são usados) | P |
| Liga Diversity paga 120 sem limite de status — vira a única liga que vale a pena; rebalancear | P |

### 2.4 Economia e progressão

| Item | Esforço |
|---|---|
| **Missões diárias e semanais** com pool de 20+ (vencer numa liga, usar linguagem X, forjar, desafiar amigo), botão de resgatar e 1 troca por dia | M |
| **Conquistas persistidas** com níveis bronze/prata/ouro, barra de progresso, recompensa e aviso ao desbloquear (hoje são 12, recalculadas a cada visita, sem recompensa) | M |
| **Calendário de login** de 7 dias com prêmio crescente (pack no dia 7) | P |
| **Pity**: Legendary garantida a cada N packs + odds visíveis na loja | P |
| **Alívio de fragmentos**: fragmento coringa (troca 3:1), escolher a linguagem do drop, wishlist aumenta chance. Resolve "usuário sem fragmentos conhecidos (caso Keslley)" | P |
| Shiny também pode sair em duplicatas (hoje só na primeira cópia) | P |
| Contar duplicatas (`UserCard.quantity` nunca incrementa, "Total Pulls" = cartas únicas) | P |
| Níveis desbloquearem algo além de packs (modos, molduras, títulos) | M |
| Histórico de BITS (tabela de transações) — base para auditoria e pagamento | M |

### 2.5 UX geral

| Item | Esforço |
|---|---|
| **Onboarding**: pack inicial + tour de 4 passos (abrir pack → coleção → time → primeira batalha) ligado às primeiras missões | M |
| **Confirmação de compra** com odds (hoje um clique já gasta BITS) e botão "Abrir agora" direto do toast | P |
| Trocar todos os `alert()` por toasts | P |
| Estados vazios com ilustração e ação (Coleção, Forja sem fragmentos, Amigos, Histórico de batalha) | P |
| Loading/skeleton na loja | P |
| Amigos no menu de navegação; nomes consistentes entre menu e títulos | P |
| Notificações: limitar/limpar a lista (cresce sem fim) | P |
| **Português (PT-BR)** com next-intl, mantendo inglês | G |

### 2.6 Áudio

| Item | Esforço |
|---|---|
| `AudioManager` único: desbloqueia no primeiro toque, mute salvo, slider de volume | P |
| Ligar os **24 sons que já existem** em `public/sounds/` e não são usados (booster, loja, vitória, notificações) | P |
| Criar sons de revelação Epic/Legendary e uma música curta de batalha | P |
| Mute no mini-game de hacking (o drone ambiente não tem como desligar) | P |

### 2.7 Acessibilidade e mobile

| Item | Esforço |
|---|---|
| Respeitar "reduzir movimento" (`MotionConfig reducedMotion="user"`) e suavizar o flash de tela cheia da Legendary (risco para fotossensíveis) | P |
| Packs e cartas como botões (navegação por teclado), `aria-label`, foco preso e Esc nos modais | M |
| Remover `maximumScale: 1` (bloqueia zoom) e subir contraste para AA | P |
| Carta com tamanho responsivo (`w-[min(16rem,80vw)]`); remover `touch-none` que trava o scroll; zoom de 1,5× estoura em 375px | P |
| Barra de abas inferior no celular | M |
| PWA (instalar na tela inicial) | P |

### 2.8 Engenharia

| Item | Esforço |
|---|---|
| CI no GitHub Actions: `tsc`, `eslint`, `next build`, testes | P |
| Testes de concorrência (compra, abertura, daily, resposta de desafio) | M |
| Mover JSON (inventário, notificações, fragmentos) para tabelas próprias | G |
| Índices faltando: `UserCard.userId`, `UserMission.userId`, `Battle(defenderId,status)`, `Friendship(friendId,status)`, `Card(rarity,primaryLanguage)` | P |
| `select` nas consultas quentes (hoje carregam banner em base64 de até 600 KB + hash da senha) | P |
| Validação com zod em todas as rotas | M |
| Sentry/logs estruturados + registrar headers de rate limit do GitHub | P |
| Usar o token OAuth do GitHub do próprio jogador nas buscas do booster dele (cota de busca por jogador em vez de uma só para o servidor) | M |
| `next.config.ts`: otimização de imagens e headers de segurança (CSP) | P |
| Reduzir os 182 erros de lint (173 são `any`) | M |

---

## Fase 3 — Novas features 🟢

### 3.1 Competitivo

| Feature | Descrição | Esforço |
|---|---|---|
| **Sistema de elos** | Bronze → Prata → Ouro → Platina → Diamante por faixa de rating, temporadas com reset suave, partidas de colocação, recompensa por promoção e por fim de temporada | M |
| **PvP assíncrono "fantasma"** | Batalhar contra o time ativo salvo de outros jogadores com rating parecido (±100). Substitui os oponentes aleatórios e dá sentido ao rating | M |
| **Desafios melhores** | Só entre amigos, travar as cartas usadas, revanche/melhor de 3, aposta de BITS combinada, link de desafio compartilhável | M |
| **Escolhas táticas na batalha** | Antes de cada confronto, escolher trocar a carta ou uma postura (Agressivo / Defensivo / Habilidade) em pedra-papel-tesoura. Hoje o jogador não decide nada durante a luta | G |

### 3.2 Modos de jogo

| Feature | Descrição | Esforço |
|---|---|---|
| **Torre (estilo Mortal Kombat)** | ~10 andares de oponentes temáticos cada vez mais fortes ("Rust Gauntlet", chefe = Legendary famoso), recompensas por marco, ranking semanal. Reaproveita `resolve3v3Battle` | M |
| **Liga pessoal estilo Cartola** | Montar elenco de 5 devs com orçamento (preço por raridade); pontos semanais vêm da atividade **real** no GitHub (commits, estrelas ganhas, PRs). Ligas privadas com amigos. É a feature mais "única" do jogo | G |
| **Eventos semanais** | Rate-up temático (semana do Rust, devs brasileiros), "Dev da Semana", boosters por tempo limitado | M |

### 3.3 Cartas e coleção

| Feature | Descrição | Esforço |
|---|---|---|
| **Treinar cartas** | Gastar BITS + duplicatas/fragmentos para subir níveis (+2% status por nível, teto por raridade). Dá uso para duplicatas | M |
| **Coleções/sets** | Completar o elenco de um pack ou "todas as Epic de Rust" dá título, moldura ou banner; mostrar % por pack | M |
| **Wishlist ativa** | Itens da wishlist com chance levemente maior | P |
| **Carta "viva"** | Atualizar status periodicamente conforme o dev real ganha estrelas/seguidores (com limite para não desbalancear) | M |

### 3.4 Social

| Feature | Descrição | Esforço |
|---|---|---|
| Presentear cartas para amigos | Só cartas ganhas, com taxa em BITS | M |
| Trocas entre jogadores | Depois do presente; sem valor em dinheiro | G |
| Perfil compartilhável | Página pública com vitrine e card de preview para redes sociais | P |
| Feed de atividade de amigos | "Fulano tirou uma Legendary" | M |

### 3.5 Visual de batalha

| Feature | Descrição | Esforço |
|---|---|---|
| Animações de combate | Avanço da carta, pausa no impacto, tremida de tela, KO se desfazendo, barra de HP com rastro | M |
| Replay de batalha | Assistir de novo / compartilhar | M |

---

## Fase 4 — Monetização 🟢 (só depois da Fase 0)

> **Atenção legal (confirmar com advogado antes):**
> - Lei 15.211/2025 (ECA Digital) proíbe loot boxes em jogos voltados ou acessíveis a menores → vender **packs aleatórios por dinheiro real** exige verificação de idade, ou simplesmente não fazer.
> - CDC: transparência de odds e preço, e direito de arrependimento de 7 dias.
> - Sem saque/troca por dinheiro, para não cair na regulação de apostas (Lei 14.790/2023).
> - As cartas usam nome e foto de pessoas reais: monetizar isso tem risco de direito de imagem e LGPD. Oferecer opt-out/remoção para os devs.

| Item | Esforço |
|---|---|
| Pré-requisitos: Fase 0 completa (moeda atômica) + histórico de transações | — |
| Pix (Mercado Pago / Pagar.me) ou Stripe, com webhook idempotente | M |
| Vender cosméticos, passe de temporada premium e itens diretos — não packs aleatórios | M |
| **Passe de temporada** (trilha grátis + premium), junto com o sistema de elos | G |
| Página para devs pedirem remoção da própria carta | P |

---

## Ordem sugerida

1. **Fase 0 inteira** — principalmente 0.1–0.6 (risco de apagar produção e duplicação de moeda).
2. **1.1 sorteio de devs** + **1.2 ranking** — são as duas queixas atuais.
3. **1.3–1.7** — bugs restantes, áudio, "Tap to reveal", wiki.
4. **2.1 abertura de booster** + **2.2 visual das cartas** — maior impacto na sensação do jogo.
5. **2.3 balanceamento** + **2.4 missões/conquistas/login diário** — dão motivo para voltar todo dia.
6. **3.1 elos** + **3.2 torre** — modos novos.
7. **3.2 liga estilo Cartola**, social, monetização.

---

## Lista original de ideias → onde está no roadmap

| Ideia | Status | Onde |
|---|---|---|
| Revelação uma carta por vez (Pokémon/MTG) | pendente | 2.1 |
| Verificar se a API está funcionando / mesmos devs | marcado "ok", **mas continua** | 1.1 |
| O que fazer quando o usuário não tem fragmentos (Keslley) | pendente | 2.4, 2.5 |
| Sistema de elos | pendente | 1.2, 3.1 |
| Sincronizar BITS | pendente | 1.5 |
| Métodos de pagamento | pendente | Fase 4 |
| Treinar as cartas | pendente | 3.3 |
| Melhorar os desafios | pendente | 1.4, 3.1 |
| Arrumar o ranking | pendente | 1.2 |
| Efeitos sonoros | pendente | 2.6 |
| Modo torre (Mortal Kombat) | pendente | 3.2 |
| Melhorar as missões | pendente | 1.3, 2.4 |
| Ligas pessoais tipo Cartola | pendente | 3.2 |
| Áudio da batalha só inicia após clicar no som | pendente | 1.5 |
| Melhorar os achievements | pendente | 2.4 |
| "Tap to reveal" em cima dos status | pendente | 1.5 |

### Já entregue (da lista e do changelog até v1.8)

Rebalanceamento de status · XP corrigido · fim das batalhas infinitas · botão de pular batalha · suporte mobile · fragmentos e forja · fadiga/stamina · balanceamento de raridades · wiki · changelog · clique para abrir booster · personalização de perfil · texto dos boosters · lealdade · sistema de desafios · onboarding de username · PRs de segurança/performance (#1–#18).
