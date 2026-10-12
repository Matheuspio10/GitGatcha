# Análise do GitPacks: o que aproveitar no GitGacha

> Repositório: https://github.com/dparker1005/GitPacks (lido em 12/10/2026, branch `main`)
> **Licença MIT:** dá para copiar código, desde que o aviso de copyright do GitPacks fique junto do trecho copiado (um comentário no topo do arquivo basta).

## Como o GitPacks funciona

| Aspecto | GitPacks | GitGacha |
|---|---|---|
| O que é uma carta | Contribuidor de **um repositório** escolhido pelo jogador | **Qualquer dev do GitHub**, sorteado de forma uniforme |
| Raridade | **Relativa dentro do repo:** os 3% mais fortes são Mythic, os 7% seguintes Legendary, depois 15% Epic, 25% Rare e o resto Common | Absoluta, por faixa de seguidores e estrelas (filtrável na busca do GitHub) |
| Status | `power` 1–99, misturando percentil e escala log de commits, PRs, issues, consistência, sequência e pico semanal | Fórmula "fama" (estrelas, forks, repos, idade) |
| Objetivo | Colecionar e completar o set de cada repo; ranking por pontos | Batalhas PvE/PvP, ranking por rating |
| Economia | Sem moeda. 2 packs que regeneram a cada 12 h, packs bônus, "estrelas" de reciclagem | BITS, loja, fragmentos, forja |
| Stack | Next 16 + Supabase (RPCs em SQL), cliente em JS puro (`gitpacks.js`, 4,2 mil linhas), **sem testes** | Next 16 + Prisma/Neon, React, 125 testes |

O sorteio do pack deles segue a mesma ideia do nosso: sorteia a raridade por peso (60/22/12/5/1) e depois escolhe uniforme dentro dela. A 5ª carta é sempre Rare ou melhor. O pity é por repo, com Legendary garantida em 10 packs e Mythic em 20, e funciona trocando a carta mais fraca do pack.

---

## O que vale trazer (em ordem de retorno)

### 1. Carta compartilhável + "Copiar para o README" — 🟡 P, maior retorno
É o motor de crescimento deles, e é a maior lacuna nossa: não temos nenhuma página com Open Graph, nenhum botão de compartilhar e nenhuma imagem de carta.
- Uma página pública por carta (`/card/[owner]/[repo]/[login]`) só para expor as meta tags `og:image` e `twitter:card` e redirecionar para o jogo ([page.tsx](https://github.com/dparker1005/GitPacks/blob/main/app/card/%5Bowner%5D/%5Brepo%5D/%5Blogin%5D/page.tsx)).
- Uma rota que gera o **PNG da carta** (SVG → PNG com `@resvg/resvg-js`), com as fontes empacotadas ([route.tsx](https://github.com/dparker1005/GitPacks/blob/main/app/api/card/%5Bowner%5D/%5Brepo%5D/%5Blogin%5D/route.tsx), [card-svg.ts](https://github.com/dparker1005/GitPacks/blob/main/app/lib/card-svg.ts)).
- Botões **Share on X**, **Copiar link** e **Copiar para o README**. O último gera um markdown `[![card](png)](link)` que o dev cola no README do perfil.

**Para nós:** a carta **Signature** do jogador é perfeita para isso. Ela aparece no README do perfil do GitHub dele, e cada visitante vira um link para o GitGacha. Dá para fazer com `ImageResponse` do próprio Next (`next/og`), sem dependência nova. Isso cobre o item "Perfil compartilhável" (3.4), que vale subir de prioridade.

### 2. Indicação de amigos + recompensa por compartilhar — 🟡 P
- O código de indicação é o próprio username. **Os dois ganham** (5 packs cada), com teto de 10 indicações por pessoa e bloqueio de autoindicação. A chave primária em `referred_id` impede que alguém seja indicado duas vezes. Tudo roda numa única transação ([SQL](https://github.com/dparker1005/GitPacks/blob/main/supabase/migrations/20260318_share_reward_and_referrals.sql)).
- "Compartilhe no X" paga 5 packs uma única vez. É na base da confiança: clicar no link já conta.

**Para nós:** a porta para o mesmo código é `withUserLock` + Prisma. **Cuidado:** aqui dá para criar conta com e-mail e senha, o que facilita contas falsas. Só pagar a indicação quando o indicado **conectar o GitHub** (ou depois de X dias / Y packs abertos).

### 3. Missões diárias com atividade **real** no GitHub — 🟡 P
Esta é a ideia mais elegante do código deles ([dailies.ts](https://github.com/dparker1005/GitPacks/blob/main/app/lib/dailies.ts), [claim](https://github.com/dparker1005/GitPacks/blob/main/app/api/dailies/claim/route.ts)):
- Uma única chamada a `GET /users/{login}/events/public` detecta os eventos de hoje (UTC): push, abrir issue, abrir PR, comentar issue, revisar PR.
- Cada tipo vale 1 resgate, até 3 por dia.
- **No momento do resgate eles verificam de novo no GitHub**, para não dar para trapacear com o cache, e o resgate é atômico.

**Para nós:** criar um grupo "missões de dev" no pool das diárias para quem conectou o GitHub (+BITS por commit/PR/review do dia). Isso dá motivo para conectar o GitHub e serve de protótipo da **liga estilo Cartola** (3.2), que precisa exatamente desses dados. Limitações: só pega eventos públicos e a API pode atrasar algumas horas.

### 4. Onboarding: 1 pack sem cadastro + boas-vindas — encaixa no próximo passo do roadmap
- O visitante abre **1 pack sem login**, controlado por cookie. Na segunda tentativa aparece "Entre para abrir mais".
- No primeiro login aparece uma tela de boas-vindas que lista **todas as formas de ganhar packs** (inicial, diárias, regeneração, conquistas, compartilhar, indicar) ([showWelcomeOverlay](https://github.com/dparker1005/GitPacks/blob/main/app/gitpacks.js)).

**Para nós:** juntar isso ao onboarding (2.5). O visitante abre um booster grátis e, ao se cadastrar, **as cartas vão para a conta**. Precisa de limite por IP (já temos `RateLimitHit`), e o pack de visitante consome a reserva do booster.

### 5. Títulos e habilidades com personalidade — 🟢 P, só cosmético
Cada carta recebe um **título** e uma **habilidade com texto** a partir do status dominante e da raridade ([route.ts, `getTitle`/`getAbility`](https://github.com/dparker1005/GitPacks/blob/main/app/api/repo/%5Bowner%5D/%5Brepo%5D/route.ts)). Exemplos: "PR Overlord — 1.2K PRs merged", "Founding Flame" para o primeiro commit do repo, "Eternal" para quem ficou inativo.

**Para nós:** dar títulos com os dados que já temos, como muitas estrelas → "Star Magnet", conta antiga → "Veterano", muitos repos → "Prolífico", e a linguagem. Não mexe nos status, então **não precisa subir `STAT_VERSION`**. Os textos são fáceis de copiar e adaptar.

### 6. Reciclar duplicatas e comprar a carta que falta ("cherry-pick") — ajuda o "alívio de fragmentos"
- Duplicata vira estrela: Common 1, Rare 3, Epic 10, Legendary 30, Mythic 100.
- Com as estrelas o jogador **escolhe uma carta específica que falta**, a cerca de 5× o valor de reciclagem (5/15/50/150/500). Também dá para trocar 100 estrelas por um pack ([recycling.ts](https://github.com/dparker1005/GitPacks/blob/main/app/lib/recycling.ts)).

**Para nós:** a forja já existe, mas a wishlist ainda depende de sorte. Comprar **uma carta da wishlist** com fragmentos, a um preço alto, não fere a regra 1, porque é compra e não sorteio. Para não virar "compre o Torvalds", só liberar devs que **já existem na tabela `Card`** (alguém já tirou) ou que saíram em boosters do próprio jogador. Antes disso é preciso resolver "Contar duplicatas" (2.4).

### 7. Sprints: competição diária e semanal sem esforço do jogador — base para "Eventos semanais" (3.2)
- O cron escolhe um repo em destaque por dia e outro por semana.
- **O jogador não monta nada**: no fim, todos que têm cartas do repo são pontuados pelas 5 melhores (1 por raridade). Empates dividem a posição (1, 1, 3) ([sprint_live_power.sql](https://github.com/dparker1005/GitPacks/blob/main/supabase/migrations/20260727_sprint_live_power.sql), [cron](https://github.com/dparker1005/GitPacks/blob/main/app/api/sprints/cron/route.ts)).
- Lição de engenharia: começaram salvando a escalação e mudaram para **calcular ao vivo**, o que tirou um passo e uma fonte de bugs.

**Para nós:** "Sprint da semana" com tema (linguagem Rust, org Vercel, "Dev da Semana"). A pontuação é o poder das suas melhores cartas do tema, calculado na hora; quem ficar no topo ganha BITS. Movimenta quem não joga PvP.

### 8. Segundo ranking: Colecionador — 🟢 P
O ranking deles é de coleção: pontos por raridade (1/2/5/15/50) mais bônus de 1,5× por set completo. Hoje o nosso só aparece para quem joga PvP. Uma aba "Colecionador" (pontos por cartas únicas) dá lugar a quem só coleciona e custa pouco.

### 9. Comparar coleção com um amigo — 🟢 P
A rota `profile/[username]/compare` compara as coleções de dois jogadores. No nosso Amigos, isso vira "cartas que ele tem e você não", que já prepara presentes e trocas (3.4).

### 10. Engenharia
- **Backup diário do banco** ([backup.yml](https://github.com/dparker1005/GitPacks/blob/main/.github/workflows/backup.yml)): GitHub Actions roda `pg_dump`, compacta, envia e apaga os backups com mais de 30 dias. A janela de restauração do Neon no plano grátis é curta, então vale ter isso também. ⚠️ Não usar *artifacts* do Actions se o repo for público, porque o dump tem e-mails e hashes de senha. Mande para um armazenamento privado ou criptografe com uma chave em secret. Isso pode entrar junto do item **CI no GitHub Actions (2.8)**.
- **Atualização em segundo plano sem cron** ([refresh-coordinator.ts](https://github.com/dparker1005/GitPacks/blob/main/app/lib/refresh-coordinator.ts)):
  - a cada requisição, tentam pegar uma "vaga" global com `UPDATE ... WHERE updated_at < agora-5min RETURNING`, e só um processo ganha;
  - quem ganha atualiza **o item mais desatualizado** do cache, num rodízio;
  - antes faz uma checagem barata para ver se algo mudou.

  É o padrão certo para a **"Carta viva" (3.3)**: atualizar o status do dev mais antigo a cada N minutos aproveitando o tráfego. Se o status mudar, respeitar a regra 4 (`STAT_VERSION`).
- **Exibir as odds do pack** (`getPackOddsHTML`): o item "Confirmação de compra com odds" (2.5) já está no backlog, e o CDC exige essa transparência.

---

## O que NÃO copiar

- **Raridade relativa por percentil.** Ela muda sempre que entra um contribuidor novo (eles têm até "set quebrado" por causa disso), não vira filtro de busca do GitHub (quebra a regra 2) e bagunçaria o balanceamento das batalhas.
- **Packs que regeneram por tempo no lugar da moeda.** Combina com um jogo só de coleção; o nosso tem BITS e loja.
- **Os pontos frágeis de concorrência.** O pity deles é lido antes e gravado depois, fora da transação. O ganho de regeneração usa só um `eq` otimista. O resgate de conquistas insere e depois sorteia sem transação. O nosso `withUserLock` já é mais seguro.
- **Arquitetura do cliente** (um único JS de 4 mil linhas manipulando o DOM) e a **falta de testes**. Estamos à frente nisso.

## Já temos (validação de que estamos no caminho)
Sortear a raridade e depois escolher uniforme dentro dela, pity com garantia, a própria carta do jogador (Signature), conquistas com recompensa, missões que renovam à meia-noite UTC, tokens do GitHub fora de tabelas públicas (eles precisaram de uma migração de segurança para isso; os nossos ficam em `Account`, só no servidor).

## Sugestão de encaixe no ROADMAP
1. **Onboarding (próximo passo)** + pack de visitante + tela de boas-vindas (item 4).
2. **Carta compartilhável / README da Signature** + indicação (itens 1 e 2), juntos num PR de "crescimento".
3. **Missões de dev pelo GitHub** (item 3) e **títulos** (item 5): pequenos, cabem numa rodada.
4. **Backup** junto com o **CI** (item 10).
5. Sprints/eventos, ranking Colecionador, compra de carta da wishlist e comparar coleções entram na Fase 3.
