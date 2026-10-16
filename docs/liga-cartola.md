# Liga Dev (estilo Cartola): plano

> Rodada de planejamento da onda 9 (item 3.2 do ROADMAP), em 15/10/2026. **Nada disto está no ar.** Este documento propõe o MVP com números reais e lista as decisões que o dono precisa tomar antes de implementar (seção "Decisões").
> Números tirados com `scripts/league-sample.ts` (só leitura: sorteia devs que são cartas no jogo e lê a atividade deles no GitHub).

## A ideia em uma frase

Toda semana, cada jogador escala **5 devs de verdade** dentro de um orçamento; eles pontuam pelo que **fizeram no GitHub naquela semana** (commits, PRs, revisões, issues, dias ativos). Ranking global e entre amigos, prêmio em BITS no fim da rodada.

## O que os números mostram

Duas amostras de 60 devs (12 por raridade, sorteados entre as cartas do banco de dev), semana de 05 a 11/10/2026, com a fórmula candidata da seção "Pontuação":

| Raridade | Sem nenhuma contribuição na semana (amostra 1 / 2) | Mediana de pontos | Melhor |
|---|---|---|---|
| Common | 92% / 82% | 0 | 43 |
| Uncommon | 92% / 75% | 0 | 58 |
| Rare | 33% / 58% | 0 a 17 | 96 |
| Epic | 75% / 75% | 0 | 100 |
| Legendary | 25% / 8% | 16 a 21 | 117 |
| **Todos** | **63% / 59%** | **0** | **117** |

O que isso significa para o desenho:

1. **A maioria dos devs fica parada numa semana qualquer.** Se a escalação viesse só da coleção do jogador (que é quase toda Common), a maioria dos times faria 0 ponto. **Proposta: o mercado é o jogo inteiro** (todo dev que já é carta, ~740 hoje), não só a coleção. Ter a carta vira um bônus (ver "Ligação com a coleção").
2. **Raridade não prevê atividade.** Ela vem de seguidores e estrelas. Há Common com 43 pontos e Epic parado. Por isso **o preço não pode vir da raridade**: tem que vir da forma recente.
3. **A forma se repete.** Dos 24 devs ativos da amostra 2, a maioria manteve o nível nas 3 semanas anteriores (por exemplo, `Dev-next-gen` 131 → 123 → 102 → 96; `bhrott` 19 → 15 → 18 → 18; `BEPb` 28 → 28 → 28 → 28). Há surpresas: `gustavoguanabara` fez 0, 0, 0 e depois 52. Isso é exatamente o que dá graça a um Cartola: o preço segue a forma, e achar quem vai "acordar" é o jogo.
4. **Atividade privada conta só em dias.** Vários devs aparecem com centenas de contribuições privadas (`phodal` 534, `acantril` 317) e quase nada público. O GitHub só informa o total privado, sem dizer o que é. A proposta é que o privado entre **só pelos dias ativos** (o calendário inclui privado quando o dev mostra), nunca pela quantidade.
5. **Os tetos quase não são atingidos.** Só 3 devs em 60 passaram de 40 commits na semana. O teto existe para conter abuso, não para achatar quem é ativo.

## Proposta de MVP

### Rodada
- **Uma rodada por semana**, de segunda 00:00 a domingo 23:59 (UTC), igual aos Sprints semanais.
- **A escalação fecha quando a rodada começa** (segunda 00:00). Durante a semana você monta a da próxima. Quem não mexer **repete a escalação anterior** (menos atrito: quem esqueceu continua jogando).
- **Parciais uma vez por dia** pelo cron diário que já existe; o resultado fecha na segunda seguinte, quando os prêmios são pagos.

### Mercado e preços
- **Mercado:** todo dev que já é carta no jogo. Devs novos entram quando alguém os tira num pack ou na Forja.
- **Preço em "créditos" (C$)**, recalculado toda segunda pela forma: `preço = 2 + média das 3 últimas rodadas ÷ 8`, arredondado, entre **C$ 2 e C$ 20**. Dev parado custa C$ 2.
- **Orçamento: C$ 50 para 5 devs** (média de C$ 10). Exemplos com os números reais:

| Dev | Forma (3 semanas) | Preço |
|---|---|---|
| `Dev-next-gen` | 131, 123, 102 | C$ 17 |
| `schneems` | 60, 57, 51 | C$ 9 |
| `Ralith` | 40, 64, 69 | C$ 9 |
| `BEPb` | 28, 28, 28 | C$ 6 |
| `chiphuyen` | 21, 21, 21 | C$ 5 |
| qualquer dev parado | 0, 0, 0 | C$ 2 |

Esse time custa C$ 46 e, na semana medida, faria 96 (capitão ×2 = 192) + 100 + 45 + 28 + 21 = **386 pontos**. Um time de 5 devs parados custa C$ 10 e faz 0, a não ser que algum "acorde" (`gustavoguanabara`, de C$ 2 para 52 pontos).

- **Sem valorização em dinheiro**: o preço só limita a escalação. Não há patrimônio nem compra e venda de cotas (fica fora da regulação de apostas; ver Fase 4 do ROADMAP).

### Escalação
- **5 devs diferentes** e um **capitão**, que pontua em dobro.
- **Sem posições** no MVP. Uma variação para depois seria exigir 3 linguagens diferentes, como a Liga Diversidade.
- **Você não pode escalar a si mesmo** (a sua conta do GitHub). Senão bastaria fazer commits para pontuar.

### Pontuação (fórmula candidata, usada nas amostras)

| O quê | Pontos | Teto por semana |
|---|---|---|
| Commit | 1 | 40 commits |
| Pull request aberto | 5 | 10 PRs |
| Revisão de PR | 3 | 10 revisões |
| Issue aberta | 2 | 10 issues |
| Dia com alguma contribuição (inclui privadas) | 3 | 7 dias |

Máximo por dev: 40 + 50 + 30 + 20 + 21 = **161 pontos** (322 como capitão).

Os dados vêm do GraphQL do GitHub (`contributionsCollection`), 10 devs por consulta. Valem as regras de contagem do próprio GitHub: commits só no branch padrão, sem forks; o GitHub pode demorar algumas horas para mostrar. Estrelas e seguidores ficam **fora do MVP**: medir o ganho da semana exigiria guardar um retrato no começo de cada rodada. Podem entrar depois.

### Ligação com a coleção
- **Ter a carta do dev escalado: +10% nos pontos dele** (Shiny: +20%). Assim o gacha ajuda sem ser obrigatório.
- Assim a Liga dá um motivo novo para os presentes e as trocas: buscar a carta de um dev que está em forma.

### Ligas e prêmios
- **MVP:** ranking **global** e ranking **entre amigos** (automático, sem precisar criar liga).
- **Prêmios por rodada em BITS:** 50 por escalar um time completo (participação); 1º 1000 · 2º 600 · 3º 400 · 4º a 10º 150 no global. É a mesma escala do Sprint semanal.
- **Depois:** ligas privadas com código de convite, temporada mensal e histórico de pontos por dev.

## Técnica (resumo para a implementação)

- **Tabelas novas, todas aditivas:**
  - `LeagueRound`: a semana, o estado e quando os prêmios foram pagos;
  - `LeaguePrice`: preço de cada dev em cada rodada;
  - `LeagueDevScore`: pontos e números brutos de cada dev em cada rodada, guardados para auditar e mostrar;
  - `LeagueLineup`: jogador, rodada, 5 devs, capitão, custo e pontos.
- **Custo de API:** só os devs escalados por alguém precisam de pontos diários. Com 100 devs distintos, são cerca de 10 consultas GraphQL por dia. O preço de toda a base (~740) é recalculado uma vez por semana, com cerca de 74 consultas, longe do limite de 5.000 pontos por hora.
- **Cron:** o cron diário de hoje ganha um passo "liga": parciais diárias e, na segunda, fechar a rodada, pagar, recalcular preços e copiar as escalações.
- **Concorrência:** salvar a escalação sob a trava do jogador; fechar a rodada e pagar uma vez só (como o pagamento dos Sprints).
- **Conta apagada ou renomeada** (o GitHub responde 404): o dev faz 0 na rodada e sai do mercado.
- **Esforço estimado:** 2 a 3 rodadas (PRs).
  1. Dados e pontuação: tabelas, cálculo, cron e preços.
  2. Tela: mercado, escalação e parciais.
  3. Rankings e prêmios.

## Decisões (o dono responde; cada uma tem um padrão proposto)

| # | Decisão | Padrão proposto | Outras opções |
|---|---|---|---|
| L1 | De onde vêm os devs da escalação | **Qualquer dev que é carta no jogo** | Só da coleção do jogador (a maioria faria 0); qualquer usuário do GitHub (mercado infinito, caro de pontuar) |
| L2 | Preço | **Pela forma das 3 últimas rodadas, C$ 2 a 20, orçamento C$ 50** | Pela raridade (não prevê atividade); sem orçamento |
| L3 | Ter a carta | **+10% nos pontos do dev (Shiny +20%)** | Nada; obrigatório ter a carta |
| L4 | Pesos e tetos da pontuação | **Tabela acima (máximo de 161 por dev)** | Mais peso em PRs ou revisões; contar estrelas e seguidores (exige retrato semanal) |
| L5 | Atividade privada | **Só pelos dias ativos** | Ignorar; contar o total privado (sem como saber o que é) |
| L6 | Escalar a si mesmo | **Não pode** | Pode, com o mesmo teto |
| L7 | Escalar amigos que jogam | **Pode** | Não pode (evita combinar commits entre amigos) |
| L8 | Capitão | **×2** | ×1,5; sem capitão |
| L9 | Quem não mexe na escalação | **Repete a anterior** | Fica de fora da rodada |
| L10 | Prêmios | **50 por participar; top 10 global com a escala do Sprint semanal** | Prêmio também para o 1º entre amigos; só ranking, sem BITS |
| L11 | Nome no jogo | **"Liga Dev"** | "Cartola Dev", "Fantasy Dev", outro |
| L12 | Escopo do MVP | **Global + amigos; ligas privadas com código na fase seguinte** | Ligas privadas já no MVP |
