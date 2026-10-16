import { prisma } from './prisma';
import { addBits } from './bitsLedger';
import { lockUser, UserFacingError } from './userLock';
import { pushNotification } from './notifications';
import { rankWithTies } from './sprints';
import { fetchContributions } from './leagueGithub';
import {
  LEAGUE_CLOSE_DELAY_HOURS,
  LEAGUE_FORM_WEEKS,
  LEAGUE_PARTICIPATION_BITS,
  LEAGUE_ROUND_DAYS,
  currentAndNextRound,
  leagueRewardFor,
  lineupCost,
  lineupError,
  lineupPoints,
  priceFromForm,
  roundEndOf,
  roundIdOf,
  scoreActivity,
  type Ownership,
} from './league';

/**
 * The Dev League in the database (rules in league.ts, plan in docs/liga-cartola.md).
 *
 * Timeline of round R (Monday to Monday, UTC):
 * - when R-1 starts, R's prices are set from the 3 full weeks before (priceRound);
 * - all through R-1, players edit their lineup for R (saveLineup);
 * - when R starts, lineups lock; players who didn't pick repeat their R-1 lineup (copyLineups);
 * - once a day the picked developers' points are refreshed (scoreRound);
 * - LEAGUE_CLOSE_DELAY_HOURS after R ends, the final points are read, ranked and paid once (closeDueRounds).
 * The daily cron runs it all (maintainLeague); everything is resumable and time-bounded.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Partial points are refreshed when older than this (one cron run a day). */
const SCORE_STALE_MS = 20 * 60 * 60 * 1000;

async function ensureRound(start: Date) {
  const id = roundIdOf(start);
  return prisma.leagueRound.upsert({
    where: { id },
    create: { id, startsAt: start, endsAt: roundEndOf(start) },
    update: {},
  });
}

type Round = Awaited<ReturnType<typeof ensureRound>>;

// ─── Prices ─────────────────────────────────────────────────────────────────

/**
 * Prices every card developer not priced yet for `round`, from the
 * LEAGUE_FORM_WEEKS full weeks before the previous round started. A developer
 * GitHub no longer knows gets price 0: off the market (and not asked again).
 */
export async function priceRound(round: Round, deadline: number) {
  const unpriced = await prisma.$queryRaw<{ id: string; githubUsername: string }[]>`
    SELECT c."id", c."githubUsername" FROM "Card" c
    WHERE NOT EXISTS (SELECT 1 FROM "LeaguePrice" p WHERE p."roundId" = ${round.id} AND p."cardId" = c."id")
    ORDER BY c."id"`;
  if (unpriced.length === 0) return { priced: 0, remaining: 0 };

  const windowEnd = new Date(round.startsAt.getTime() - LEAGUE_ROUND_DAYS * DAY_MS);
  const windowStart = new Date(windowEnd.getTime() - LEAGUE_FORM_WEEKS * LEAGUE_ROUND_DAYS * DAY_MS);
  const { counts, missing } = await fetchContributions(unpriced.map(c => c.githubUsername), windowStart, windowEnd, deadline);

  const rows = unpriced.flatMap(c => {
    const login = c.githubUsername.toLowerCase();
    if (missing.has(login)) return [{ roundId: round.id, cardId: c.id, price: 0, form: 0 }];
    const activity = counts.get(login);
    if (!activity) return []; // not reached before the deadline: next run
    const form = Math.round(scoreActivity(activity, LEAGUE_FORM_WEEKS) / LEAGUE_FORM_WEEKS);
    return [{ roundId: round.id, cardId: c.id, price: priceFromForm(form), form }];
  });
  if (rows.length > 0) await prisma.leaguePrice.createMany({ data: rows, skipDuplicates: true });
  return { priced: rows.length, remaining: unpriced.length - rows.length };
}

/** The market of a round: card id → price (developers that are on it). */
async function marketPrices(roundId: string): Promise<Map<string, number>> {
  const rows = await prisma.leaguePrice.findMany({ where: { roundId, price: { gt: 0 } }, select: { cardId: true, price: true } });
  return new Map(rows.map(r => [r.cardId, r.price]));
}

// ─── Points ─────────────────────────────────────────────────────────────────

/** How each player holds the cards picked in their lineups (for the collection bonus). */
async function ownershipOf(lineups: { userId: string; cardIds: string[] }[]) {
  const copies = await prisma.userCard.findMany({
    where: { OR: lineups.map(l => ({ userId: l.userId, cardId: { in: l.cardIds } })) },
    select: { userId: true, cardId: true, isShiny: true },
  });
  const byUser = new Map<string, Map<string, Ownership>>();
  for (const c of copies) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, new Map());
    byUser.get(c.userId)!.set(c.cardId, c.isShiny ? 'shiny' : 'owned');
  }
  return byUser;
}

/** Recomputes every lineup's points of a round from its developers' current points. */
async function recomputeLineups(roundId: string) {
  const [lineups, scores] = await Promise.all([
    prisma.leagueLineup.findMany({ where: { roundId }, select: { userId: true, cardIds: true, captainId: true, points: true } }),
    prisma.leagueDevScore.findMany({ where: { roundId }, select: { cardId: true, points: true } }),
  ]);
  if (lineups.length === 0) return;
  const devPoints = new Map(scores.map(s => [s.cardId, s.points]));
  const owned = await ownershipOf(lineups);
  for (const l of lineups) {
    const points = lineupPoints(l, devPoints, owned.get(l.userId) ?? new Map());
    if (points !== l.points) {
      await prisma.leagueLineup.update({ where: { roundId_userId: { roundId, userId: l.userId } }, data: { points } });
    }
  }
}

/**
 * Refreshes the points of the developers picked in `round` whose points are
 * older than `staleBefore` (or missing), then the lineups' points. Returns how
 * many developers are still stale (the deadline came first).
 */
export async function scoreRound(round: Round, staleBefore: Date, deadline: number, now = new Date()): Promise<number> {
  const picked = await prisma.$queryRaw<{ cardId: string; githubUsername: string }[]>`
    SELECT DISTINCT c."id" AS "cardId", c."githubUsername" FROM "LeagueLineup" l
    CROSS JOIN LATERAL unnest(l."cardIds") AS picked(id)
    JOIN "Card" c ON c."id" = picked.id
    LEFT JOIN "LeagueDevScore" s ON s."roundId" = l."roundId" AND s."cardId" = c."id"
    WHERE l."roundId" = ${round.id} AND (s."cardId" IS NULL OR s."updatedAt" < ${staleBefore})`;
  if (picked.length === 0) return 0;

  const to = now < round.endsAt ? now : round.endsAt;
  const { counts, missing } = await fetchContributions(picked.map(p => p.githubUsername), round.startsAt, to, deadline);
  let left = 0;
  for (const p of picked) {
    const login = p.githubUsername.toLowerCase();
    const activity = counts.get(login);
    if (!activity && !missing.has(login)) { left++; continue; }
    const data = activity
      ? { ...activity, points: scoreActivity(activity), missing: false }
      : { commits: 0, pullRequests: 0, reviews: 0, issues: 0, activeDays: 0, points: 0, missing: true };
    await prisma.leagueDevScore.upsert({
      where: { roundId_cardId: { roundId: round.id, cardId: p.cardId } },
      create: { roundId: round.id, cardId: p.cardId, ...data },
      update: data,
    });
  }
  await recomputeLineups(round.id);
  return left;
}

// ─── Lineups ────────────────────────────────────────────────────────────────

/** Players who didn't pick for `round` repeat their previous lineup (L9). Idempotent. */
async function copyLineups(round: Round) {
  const previousId = roundIdOf(new Date(round.startsAt.getTime() - LEAGUE_ROUND_DAYS * DAY_MS));
  const [previous, prices] = await Promise.all([
    prisma.leagueLineup.findMany({
      where: { roundId: previousId, user: { leagueLineups: { none: { roundId: round.id } } } },
      select: { userId: true, cardIds: true, captainId: true },
    }),
    marketPrices(round.id),
  ]);
  if (previous.length === 0) return 0;
  // Kept as they were, even if the new prices pass the budget: nobody chose them again
  const { count } = await prisma.leagueLineup.createMany({
    data: previous.map(l => ({ roundId: round.id, userId: l.userId, cardIds: l.cardIds, captainId: l.captainId, cost: lineupCost(l.cardIds, prices) })),
    skipDuplicates: true,
  });
  return count;
}

/** The player's own card (their GitHub account), which they can't pick (L6). */
async function selfCardId(userId: string): Promise<string | null> {
  const own = await prisma.userCard.findFirst({ where: { userId, edition: 'signature' }, select: { cardId: true } });
  return own?.cardId ?? null;
}

/** Saves the player's lineup for the next round (the one that hasn't started). */
export async function saveLineup(userId: string, cardIds: string[], captainId: string, now = new Date()) {
  const { next } = currentAndNextRound(now);
  const round = await ensureRound(next);
  const [prices, self] = await Promise.all([marketPrices(round.id), selfCardId(userId)]);
  if (prices.size === 0) throw new UserFacingError('league.marketNotReady', 409);
  const error = lineupError({ cardIds, captainId }, prices, self);
  if (error) throw new UserFacingError(`league.${error}`, 400);
  const cost = lineupCost(cardIds, prices);
  await prisma.leagueLineup.upsert({
    where: { roundId_userId: { roundId: round.id, userId } },
    create: { roundId: round.id, userId, cardIds, captainId, cost },
    update: { cardIds, captainId, cost },
  });
  return { roundId: round.id, cost };
}

// ─── Closing ────────────────────────────────────────────────────────────────

/**
 * Closes every round that ended at least LEAGUE_CLOSE_DELAY_HOURS ago: final
 * points, ranking (ties share the place), prizes paid once. A round whose
 * final points aren't all in yet (deadline) waits for the next run.
 */
export async function closeDueRounds(now: Date, deadline: number): Promise<number> {
  const due = await prisma.leagueRound.findMany({
    where: { closedAt: null, endsAt: { lte: new Date(now.getTime() - LEAGUE_CLOSE_DELAY_HOURS * 3600_000) } },
    orderBy: { endsAt: 'asc' },
  });
  let closed = 0;
  for (const round of due) {
    // Points read after the delay are final
    const finalAfter = new Date(round.endsAt.getTime() + LEAGUE_CLOSE_DELAY_HOURS * 3600_000);
    if (await scoreRound(round, finalAfter, deadline, now) > 0) break;
    if (await closeRound(round.id, now)) closed++;
  }
  return closed;
}

/** Ranks and pays one round once (the round row is locked and re-checked). Exported for the concurrency test. */
export async function closeRound(roundId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ closedAt: Date | null }[]>`SELECT "closedAt" FROM "LeagueRound" WHERE "id" = ${roundId} FOR UPDATE`;
    if (!row || row.closedAt) return false;

    const lineups = await tx.leagueLineup.findMany({ where: { roundId }, select: { userId: true, points: true }, orderBy: [{ points: 'desc' }, { userId: 'asc' }] });
    const ranked = rankWithTies(lineups.map(l => ({ ...l, score: l.points })));
    // Paid in id order, the same lock order as the season and Sprint closes
    for (const r of [...ranked].sort((a, b) => a.userId.localeCompare(b.userId))) {
      const prize = leagueRewardFor(r.position);
      const bits = LEAGUE_PARTICIPATION_BITS + prize;
      await tx.leagueLineup.update({ where: { roundId_userId: { roundId, userId: r.userId } }, data: { position: r.position, rewardBits: bits } });
      await lockUser(tx, r.userId);
      await addBits(r.userId, bits, 'league_reward', { tx, detail: `Dev League ${roundId} · #${r.position}` });
      await pushNotification(tx, r.userId, 'league_result',
        `Dev League (week of ${roundId}): ${r.points} points, #${r.position} of ${ranked.length}. +${bits} BITS!`, '/league');
    }
    await tx.leagueRound.update({ where: { id: roundId }, data: { closedAt: now } });
    return true;
  }, { maxWait: 10_000, timeout: 60_000 });
}

// ─── Cron ───────────────────────────────────────────────────────────────────

/**
 * The league's daily maintenance, within `budgetMs`: opens the rounds, repeats
 * lineups, closes and pays finished rounds, refreshes the running round's
 * points and prices the next market. Never throws (the cron goes on).
 */
export async function maintainLeague(budgetMs: number, now = new Date()) {
  const deadline = Date.now() + budgetMs;
  const report = { copied: 0, closed: 0, staleScores: 0, priced: 0, unpriced: 0, error: null as string | null };
  try {
    const { current, next } = currentAndNextRound(now);
    const [running, upcoming] = [await ensureRound(current), await ensureRound(next)];
    report.copied = await copyLineups(running);
    report.closed = await closeDueRounds(now, deadline);
    // Partial points (few developers, what players follow) before the market, which
    // is big but resumable: whatever isn't priced today is priced on the next run
    report.staleScores = await scoreRound(running, new Date(now.getTime() - SCORE_STALE_MS), deadline, now);
    const prices = await priceRound(upcoming, deadline);
    report.priced = prices.priced;
    report.unpriced = prices.remaining;
  } catch (err) {
    report.error = (err as Error).message;
    console.error('[League] maintenance failed:', err);
  }
  return report;
}

// ─── Reading ────────────────────────────────────────────────────────────────

/** The player and their accepted friends who play the running round, best first. */
async function friendsRanking(userId: string, roundId: string) {
  const links = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] },
    select: { userId: true, friendId: true },
  });
  const ids = [userId, ...links.map(f => (f.userId === userId ? f.friendId : f.userId))];
  const rows = await prisma.leagueLineup.findMany({
    where: { roundId, userId: { in: ids } },
    orderBy: [{ points: 'desc' }, { updatedAt: 'asc' }],
    select: { userId: true, points: true, user: { select: { username: true, image: true } } },
  });
  return rows.map(r => ({ username: r.user.username, image: r.user.image, points: r.points, you: r.userId === userId }));
}

/** The player's most recent closed round: points, place and BITS. */
async function lastResult(userId: string) {
  const lineup = await prisma.leagueLineup.findFirst({
    where: { userId, round: { closedAt: { not: null } } },
    orderBy: { roundId: 'desc' },
    select: { roundId: true, points: true, position: true, rewardBits: true, round: { select: { _count: { select: { lineups: true } } } } },
  });
  return lineup && { roundId: lineup.roundId, points: lineup.points, position: lineup.position, rewardBits: lineup.rewardBits, players: lineup.round._count.lineups };
}

const cardSelect = { id: true, name: true, githubUsername: true, avatarUrl: true, rarity: true, primaryLanguage: true } as const;

/** Everything the league page needs for one player: the market, their lineups and the running round's top. */
export async function getLeagueState(userId: string, now = new Date()) {
  const { current, next } = currentAndNextRound(now);
  const [running, upcoming] = [await ensureRound(current), await ensureRound(next)];

  const [prices, owned, self, mine, scores, top, players] = await Promise.all([
    prisma.leaguePrice.findMany({
      where: { roundId: upcoming.id, price: { gt: 0 } },
      select: { price: true, form: true, card: { select: cardSelect } },
      orderBy: [{ price: 'desc' }, { form: 'desc' }],
    }),
    prisma.userCard.findMany({ where: { userId }, select: { cardId: true, isShiny: true } }),
    selfCardId(userId),
    prisma.leagueLineup.findMany({ where: { userId, roundId: { in: [running.id, upcoming.id] } } }),
    prisma.leagueDevScore.findMany({ where: { roundId: running.id }, select: { cardId: true, points: true, commits: true, pullRequests: true, reviews: true, issues: true, activeDays: true, updatedAt: true } }),
    prisma.leagueLineup.findMany({
      where: { roundId: running.id },
      orderBy: [{ points: 'desc' }, { updatedAt: 'asc' }],
      take: 10,
      select: { points: true, user: { select: { username: true, image: true } } },
    }),
    prisma.leagueLineup.count({ where: { roundId: running.id } }),
  ]);

  const ownership = new Map(owned.map(o => [o.cardId, o.isShiny ? 'shiny' as const : 'owned' as const]));
  const scoreOf = new Map(scores.map(s => [s.cardId, s]));
  const lineupView = async (roundId: string) => {
    const l = mine.find(x => x.roundId === roundId);
    if (!l) return null;
    const cards = await prisma.card.findMany({ where: { id: { in: l.cardIds } }, select: cardSelect });
    return {
      cardIds: l.cardIds,
      captainId: l.captainId,
      cost: l.cost,
      points: l.points,
      position: l.position,
      cards: l.cardIds.map(id => cards.find(c => c.id === id)).filter(c => !!c).map(c => ({
        ...c,
        owned: ownership.get(c.id) ?? 'none',
        score: roundId === running.id ? scoreOf.get(c.id) ?? null : null,
      })),
    };
  };

  const runningLineup = await lineupView(running.id);
  const [totalCards, ahead, friends, last] = await Promise.all([
    prisma.card.count(),
    runningLineup ? prisma.leagueLineup.count({ where: { roundId: running.id, points: { gt: runningLineup.points } } }) : Promise.resolve(0),
    friendsRanking(userId, running.id),
    lastResult(userId),
  ]);
  return {
    running: {
      id: running.id, startsAt: running.startsAt, endsAt: running.endsAt, players,
      lineup: runningLineup,
      position: runningLineup ? ahead + 1 : null,
      top,
      friends,
    },
    last,
    next: { id: upcoming.id, startsAt: upcoming.startsAt, lineup: await lineupView(upcoming.id) },
    market: prices.map(p => ({ ...p.card, price: p.price, form: p.form, owned: ownership.get(p.card.id) ?? 'none' })),
    marketComplete: prices.length > 0 && (await prisma.leaguePrice.count({ where: { roundId: upcoming.id } })) >= totalCards,
    selfCardId: self,
  };
}
