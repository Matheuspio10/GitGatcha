# GitGacha

Jogo de cartas colecionáveis (gacha) em que cada carta é um **desenvolvedor real do GitHub**. Os atributos vêm do perfil público (estrelas, forks, repositórios, seguidores, idade da conta) e a raridade vem dos seguidores, com bônus por estrelas.

Jogadores abrem boosters temáticos, montam times de 3, batalham (PvE e desafios entre amigos), forjam cartas com fragmentos e sobem de nível. Quem conecta o GitHub ganha a **própria carta na edição Signature**.

Roadmap e análise de melhorias: [ROADMAP.md](ROADMAP.md).

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4 + framer-motion
- Prisma 6 + PostgreSQL (Neon)
- next-auth v4 (GitHub, Google e e-mail/senha)
- Deploy na Vercel (Fluid compute) com um cron diário

## Rodando localmente

```bash
npm install
npm run dev
```

Variáveis de ambiente (`.env.local`; veja `.env.example`):

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres. **Use uma branch de desenvolvimento do Neon, não a de produção.** |
| `GITHUB_TOKEN` | Token do servidor para a API do GitHub (só leitura pública) |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | next-auth |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Login com GitHub (OAuth App; callback `/api/auth/callback/github`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login com Google |
| `CRON_SECRET` | Protege `/api/cron/rebuild-fallback-pool` (obrigatório em produção) |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes (`node --test` + `tsx`) — puros, sem banco nem rede |
| `npm run build` | Build local (não mexe no banco) |
| `npm run db:migrate` | Aplica as migrações pendentes no banco do `DATABASE_URL` |
| `node --env-file=.env.prod --import tsx scripts/recalculate-cards.ts` | Recalcula as cartas com dados atuais do GitHub (dry run; `--apply` grava; `--only=a,b` só algumas) |
| `node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts` | Refaz os ratings a partir do histórico PvP (dry run; `--apply` grava) |
| `node --env-file=.env.prod --import tsx scripts/dedupe-user-cards.ts` | Junta cartas duplicadas de um jogador (dry run; `--apply` grava) |
| `node --import tsx scripts/balance-sim.ts [seed] [fame\|impact]` | Simulador de batalhas para balanceamento (sem banco) |

Na Vercel o build usa `scripts/vercel-build.mjs`: as migrações rodam **só no deploy de produção**, só quando há alguma pendente e pela conexão direta do Neon (o pooler pode prender a trava de migração do Prisma).

## Bancos: desenvolvimento × produção

- `.env` e `.env.local` → **branch de desenvolvimento do Neon** (usada por `npm run dev`, Prisma CLI e testes manuais).
- `.env.prod` → **produção**, usado só de propósito pelos scripts de manutenção (`--env-file=.env.prod`).

Para criar a branch: no console do Neon, abra o projeto → **Branches** → **Create branch** a partir de `main` (copia os dados atuais) → em **Connection details**, copie a connection string *pooled* e coloque em `DATABASE_URL` no `.env` e no `.env.local`. Aplique as migrações nela com `npm run db:migrate`.

## Como o sorteio dos boosters funciona

O núcleo do jogo: **dentro do filtro de um booster, todo dev do GitHub da raridade sorteada (com pelo menos 1 repositório público) tem a mesma chance de sair** — famoso ou conta nova.

- `src/lib/rarity.ts` — faixas de seguidores, bônus por estrelas, chances por slot.
- `src/lib/devSampler.ts` — sorteio uniforme (por ID de conta, por janelas de busca sobre a curva de cadastro do GitHub, ou por membros de organizações). Coberto por testes estatísticos em `devSampler.test.ts`.
- `src/lib/boosterReserve.ts` — reserva consumível de devs pré-sorteados (cada um usado uma vez), reposta em segundo plano.
- `src/lib/samplerStore.ts` — cache no banco, pools de organizações e uso do token do próprio jogador.
- `src/lib/fallbackPoolService.ts` — manutenção diária (cron).

## Consistência dos dados

Toda leitura-e-escrita de BITS, inventário e campos JSON do usuário passa por `withUserLock` (`src/lib/userLock.ts`), que trava a linha do jogador numa transação. Não chame APIs externas dentro dessa trava.
