import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { addBits } from './bitsLedger';
import { pushNotification } from './notifications';
import { lockUser, type Tx } from './userLock';
import {
  SPRINT_RESULTS_KEPT,
  SPRINT_TEAM_SIZE,
  rankWithTies,
  sprintKindLabel,
  sprintPeriod,
  sprintRewardFor,
  sprintThemeById,
  type SprintKind,
  type SprintTheme,
} from './sprints';

const KINDS: SprintKind[] = ['daily', 'weekly'];

type Db = Tx | typeof prisma;

export interface SprintStanding {
  userId: string;
  username: string;
  score: number;
  cards: number;
  position: number;
}

/** The sprint row of the running period, created (with its theme) the first time anyone asks. */
export async function ensureSprint(kind: SprintKind, now: Date) {
  const p = sprintPeriod(kind, now);
  await prisma.sprint.createMany({
    data: [{ id: p.id, kind, theme: p.theme.id, startsAt: p.startsAt, endsAt: p.endsAt }],
    skipDuplicates: true,
  });
  return prisma.sprint.findUniqueOrThrow({ where: { id: p.id } });
}

/**
 * Live standings: every named player with a card of the theme, scored by the
 * power (ATK + DEF + HP) of their SPRINT_TEAM_SIZE best ones. Only cards they
 * had before the sprint ended count, so closing late changes nothing.
 */
export async function sprintStandings(db: Db, theme: SprintTheme, endsAt: Date): Promise<SprintStanding[]> {
  if (theme.languages.length === 0) return [];
  const rows = await db.$queryRaw<{ userId: string; username: string; score: number; cards: number }[]>`
    WITH best AS (
      SELECT uc."userId",
             (c."atk" + c."def" + c."hp") AS power,
             ROW_NUMBER() OVER (PARTITION BY uc."userId" ORDER BY (c."atk" + c."def" + c."hp") DESC, c."id") AS rn
      FROM "UserCard" uc
      JOIN "Card" c ON c."id" = uc."cardId"
      WHERE c."primaryLanguage" IN (${Prisma.join(theme.languages)}) AND uc."createdAt" < ${endsAt}
    )
    SELECT b."userId", u."username", SUM(b.power)::int AS score, COUNT(*)::int AS cards
    FROM best b
    JOIN "User" u ON u."id" = b."userId"
    WHERE b.rn <= ${SPRINT_TEAM_SIZE} AND u."username" IS NOT NULL
    GROUP BY b."userId", u."username"
    ORDER BY score DESC, u."username" ASC
  `;
  return rankWithTies(rows);
}

/** The cards that make up one player's score in a theme (for "your best 3"). */
async function countedCards(userId: string, theme: SprintTheme, endsAt: Date) {
  const owned = await prisma.userCard.findMany({
    where: { userId, createdAt: { lt: endsAt }, card: { primaryLanguage: { in: theme.languages } } },
    select: { isShiny: true, card: { select: { githubUsername: true, name: true, rarity: true, primaryLanguage: true, avatarUrl: true, atk: true, def: true, hp: true } } },
  });
  return owned
    .map(o => ({ ...o.card, isShiny: o.isShiny, power: o.card.atk + o.card.def + o.card.hp }))
    .sort((a, b) => b.power - a.power)
    .slice(0, SPRINT_TEAM_SIZE);
}

/**
 * Closes every sprint that already ended: pays each position of the reward
 * table, keeps the top results and notifies the paid players. Idempotent: the
 * sprint row is locked and re-checked, so two requests can't pay it twice.
 */
export async function closeDueSprints(now = new Date()): Promise<number> {
  const due = await prisma.sprint.findMany({ where: { closedAt: null, endsAt: { lte: now } }, orderBy: { endsAt: 'asc' } });
  let closed = 0;
  for (const sprint of due) {
    const didClose = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ closedAt: Date | null }[]>`SELECT "closedAt" FROM "Sprint" WHERE "id" = ${sprint.id} FOR UPDATE`;
      if (!row || row.closedAt) return false;

      const kind = sprint.kind as SprintKind;
      const theme = sprintThemeById(sprint.theme);
      const kept = (await sprintStandings(tx, theme, sprint.endsAt)).filter(s => s.position <= SPRINT_RESULTS_KEPT);
      const results = kept.map(s => ({ ...s, rewardBits: sprintRewardFor(kind, s.position) }));
      if (results.length > 0) {
        await tx.sprintResult.createMany({
          data: results.map(r => ({ sprintId: sprint.id, userId: r.userId, position: r.position, score: r.score, rewardBits: r.rewardBits })),
        });
      }
      // Paid in id order, the same lock order as the season close
      const label = `${sprintKindLabel(kind)} · ${theme.name}`;
      for (const r of results.filter(r => r.rewardBits > 0).sort((a, b) => a.userId.localeCompare(b.userId))) {
        await lockUser(tx, r.userId);
        await addBits(r.userId, r.rewardBits, 'sprint_reward', { tx, detail: `${label} · #${r.position}` });
        await pushNotification(tx, r.userId, 'sprint_reward', `${label}: you finished #${r.position}. +${r.rewardBits} BITS!`, '/leaderboard?tab=sprints');
      }
      await tx.sprint.update({ where: { id: sprint.id }, data: { closedAt: now } });
      return true;
    }, { maxWait: 10_000, timeout: 60_000 });
    if (didClose) closed++;
  }
  return closed;
}

/** Closes what is due and makes sure the running daily and weekly sprints exist (cron). */
export async function maintainSprints(now = new Date()) {
  const closed = await closeDueSprints(now);
  for (const kind of KINDS) await ensureSprint(kind, now);
  return closed;
}

/** Both running sprints with the live top, the viewer's place and cards, and the last closed one. */
export async function getSprintsState(viewerId: string | null, now = new Date(), top = 20) {
  await closeDueSprints(now);
  return Promise.all(KINDS.map(async (kind) => {
    const sprint = await ensureSprint(kind, now);
    const theme = sprintThemeById(sprint.theme);
    const standings = await sprintStandings(prisma, theme, sprint.endsAt);
    const you = viewerId ? standings.find(s => s.userId === viewerId) ?? null : null;

    const last = await prisma.sprint.findFirst({
      where: { kind, closedAt: { not: null } },
      orderBy: { endsAt: 'desc' },
      include: { results: { where: { OR: [{ position: 1 }, ...(viewerId ? [{ userId: viewerId }] : [])] }, include: { user: { select: { username: true } } } } },
    });

    return {
      kind,
      id: sprint.id,
      theme,
      startsAt: sprint.startsAt,
      endsAt: sprint.endsAt,
      players: standings.length,
      standings: standings.slice(0, top),
      you: you ? { ...you, rewardBits: sprintRewardFor(kind, you.position) } : null,
      yourCards: viewerId ? await countedCards(viewerId, theme, sprint.endsAt) : [],
      last: last && {
        theme: sprintThemeById(last.theme),
        endsAt: last.endsAt,
        winners: last.results.filter(r => r.position === 1).map(r => ({ username: r.user.username, score: r.score })),
        you: last.results.find(r => r.userId === viewerId) ?? null,
      },
    };
  }));
}

export type SprintState = Awaited<ReturnType<typeof getSprintsState>>[number];
