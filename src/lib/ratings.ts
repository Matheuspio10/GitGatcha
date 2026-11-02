import { RATING_K_FACTOR, STARTING_RATING } from './battleConfig';
import { PLACEMENT_BATTLES, ratingKFor, softResetRating } from './seasons';

/**
 * Rating is an ELO score that only moves in PvP (friend challenge) battles.
 * Battles against the computer never touch it.
 */

// Simple ELO rating update; each side can have its own K (placement, see seasons.ts)
export function calculateNewRatings(
  winnerRating: number,
  loserRating: number,
  K: number = RATING_K_FACTOR,
  loserK: number = K
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerRating = Math.round(winnerRating + K * (1 - expectedWinner));
  const newLoserRating = Math.max(0, Math.round(loserRating + loserK * (0 - expectedLoser)));

  return { newWinnerRating, newLoserRating };
}

export interface ReplayableBattle {
  challengerId: string;
  defenderId: string | null;
  winnerId: string | null;
  status: string;
  isRandom: boolean;
  completedAt: Date | string | null;
}

/** True for battles that count for rating: completed PvP battles with a real winner. */
export function isRatedBattle(b: ReplayableBattle): boolean {
  return (
    b.status === 'COMPLETED' &&
    !b.isRandom &&
    !!b.defenderId &&
    b.defenderId !== b.challengerId &&
    b.completedAt !== null &&
    (b.winnerId === b.challengerId || b.winnerId === b.defenderId)
  );
}

/**
 * Recomputes every player's rating from scratch by replaying the rated
 * battles (completed, non-random, with a winner) in `completedAt` order, each
 * player starting at STARTING_RATING, with today's rules: placement K for each
 * player's first battles of a season, and the halfway reset at every season
 * close (`seasonResets`: when each closed season was closed).
 *
 * Pure: does not read or write the database. The returned record only has the
 * players that took part in at least one rated battle; everyone else should be
 * reset to STARTING_RATING (a season reset keeps them there).
 */
export function replayPvpRatings(
  battles: ReplayableBattle[],
  options: { startRating?: number; K?: number; placementBattles?: number; seasonResets?: (Date | string)[] } = {}
): Record<string, number> {
  const start = options.startRating ?? STARTING_RATING;
  const K = options.K ?? RATING_K_FACTOR;
  const placementBattles = options.placementBattles ?? PLACEMENT_BATTLES;
  const resets = (options.seasonResets ?? []).map(d => new Date(d).getTime()).sort((x, y) => x - y);

  const rated = battles
    .filter(isRatedBattle)
    .map((b, index) => ({ b, index, t: new Date(b.completedAt as Date | string).getTime() }))
    // Stable: battles completed at the same instant keep their input order
    .sort((x, y) => x.t - y.t || x.index - y.index);

  const ratings: Record<string, number> = {};
  let seasonBattles: Record<string, number> = {};
  let nextReset = 0;
  const resetUntil = (t: number) => {
    for (; nextReset < resets.length && resets[nextReset] <= t; nextReset++) {
      for (const id of Object.keys(ratings)) ratings[id] = softResetRating(ratings[id]);
      seasonBattles = {};
    }
  };
  for (const { b, t } of rated) {
    resetUntil(t);
    const winnerId = b.winnerId as string;
    const loserId = winnerId === b.challengerId ? (b.defenderId as string) : b.challengerId;
    const { newWinnerRating, newLoserRating } = calculateNewRatings(
      ratings[winnerId] ?? start,
      ratings[loserId] ?? start,
      ratingKFor(seasonBattles[winnerId] ?? 0, K, placementBattles),
      ratingKFor(seasonBattles[loserId] ?? 0, K, placementBattles)
    );
    ratings[winnerId] = newWinnerRating;
    ratings[loserId] = newLoserRating;
    seasonBattles[winnerId] = (seasonBattles[winnerId] ?? 0) + 1;
    seasonBattles[loserId] = (seasonBattles[loserId] ?? 0) + 1;
  }
  // Seasons closed after the last battle reset the ratings too
  resetUntil(Infinity);
  return ratings;
}
