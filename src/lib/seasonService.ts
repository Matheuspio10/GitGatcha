import { prisma } from './prisma';
import { addBits } from './bitsLedger';
import { pushNotification } from './notifications';
import { lockUser, type Tx } from './userLock';
import { STARTING_RATING } from './battleConfig';
import { PROMOTION_BITS, ranksReached, seasonEndFor, seasonRewardFor } from './seasons';

/**
 * The open season, closing any that already ended first. Cheap when nothing
 * is due (one query); called by the rankings, Ranked/PvP battles and the
 * daily cron, so a season closes even when nobody plays at midnight.
 */
export async function getCurrentSeason(now = new Date()) {
  await closeDueSeasons(now);
  return prisma.season.findFirst({ where: { closedAt: null }, orderBy: { id: 'desc' } });
}

/**
 * Closes every open season whose end has passed: pays each PvP player for their
 * peak rank, records their result, resets every rating halfway to the start
 * and opens the next season. Idempotent: the season row is locked and
 * re-checked, so two requests can't close (and pay) the same season twice.
 */
export async function closeDueSeasons(now = new Date()): Promise<number> {
  let closed = 0;
  for (let guard = 0; guard < 24; guard++) {
    const open = await prisma.season.findFirst({ where: { closedAt: null }, orderBy: { id: 'desc' } });
    if (!open) {
      // No season yet (fresh database): start one now
      await prisma.season.create({ data: { id: 1, startsAt: now, endsAt: seasonEndFor(now) } }).catch(() => undefined);
      return closed;
    }
    if (open.endsAt > now) return closed;

    const didClose = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ closedAt: Date | null }[]>`SELECT "closedAt" FROM "Season" WHERE "id" = ${open.id} FOR UPDATE`;
      if (!row || row.closedAt) return false;

      const players = await tx.user.findMany({
        where: { seasonBattles: { gt: 0 } },
        select: { id: true, rating: true, seasonPeakRating: true, seasonBattles: true },
        orderBy: { id: 'asc' },
      });
      for (const p of players) {
        await lockUser(tx, p.id);
        const peak = Math.max(p.seasonPeakRating, p.rating);
        const { tier, bits } = seasonRewardFor(peak);
        await tx.seasonResult.create({
          data: { seasonId: open.id, userId: p.id, finalRating: p.rating, peakRating: peak, tier: tier.id, rewardBits: bits, battles: p.seasonBattles },
        });
        await addBits(p.id, bits, 'season_reward', { tx, detail: `Season ${open.id} · ${tier.name}` });
        await pushNotification(tx, p.id, 'season_end', `Season ${open.id} is over: you peaked at ${tier.name}. +${bits} BITS! Ratings were reset halfway for Season ${open.id + 1}.`, '/leaderboard');
      }

      // Soft reset (same rounding as Math.round): halfway back to the start
      await tx.$executeRaw`
        UPDATE "User"
        SET "rating" = ${STARTING_RATING} + FLOOR(("rating" - ${STARTING_RATING}) / 2.0 + 0.5),
            "seasonPeakRating" = ${STARTING_RATING} + FLOOR(("rating" - ${STARTING_RATING}) / 2.0 + 0.5),
            "seasonBattles" = 0
      `;
      await tx.season.update({ where: { id: open.id }, data: { closedAt: now } });
      await tx.season.create({ data: { id: open.id + 1, startsAt: open.endsAt, endsAt: seasonEndFor(open.endsAt) } });
      return true;
    }, { maxWait: 10_000, timeout: 60_000 });

    if (!didClose) return closed;
    closed++;
  }
  return closed;
}

/**
 * After a rated PvP battle (inside its transaction, the player locked): counts
 * the battle for the season, raises the season peak and pays the first time
 * each rank is reached this season.
 */
export async function recordSeasonProgress(tx: Tx, userId: string, newRating: number) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { seasonPeakRating: true } });
  if (!user) return;
  const reached = ranksReached(user.seasonPeakRating, newRating);
  await tx.user.update({
    select: { id: true },
    where: { id: userId },
    data: { seasonBattles: { increment: 1 }, seasonPeakRating: Math.max(user.seasonPeakRating, newRating) },
  });
  if (reached.length === 0) return;
  const season = await tx.season.findFirst({ where: { closedAt: null }, orderBy: { id: 'desc' }, select: { id: true } });
  for (const tier of reached) {
    const bits = PROMOTION_BITS[tier.id];
    if (bits <= 0) continue;
    await addBits(userId, bits, 'rank_promotion', { tx, detail: `${tier.name}${season ? ` · Season ${season.id}` : ''}` });
    await pushNotification(tx, userId, 'rank_promotion', `Promoted to ${tier.name}! +${bits} BITS`, '/leaderboard');
  }
}
