import { RATING_K_FACTOR, STARTING_RATING } from './battleConfig';

/**
 * Rating is an ELO score that only moves in PvP (friend challenge) battles.
 * Battles against the computer never touch it.
 */

// Simple ELO rating update
export function calculateNewRatings(
  winnerRating: number,
  loserRating: number,
  K: number = RATING_K_FACTOR
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerRating = Math.round(winnerRating + K * (1 - expectedWinner));
  const newLoserRating = Math.max(0, Math.round(loserRating + K * (0 - expectedLoser)));

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
 * player starting at STARTING_RATING.
 *
 * Pure: does not read or write the database. The returned record only has the
 * players that took part in at least one rated battle; everyone else should be
 * reset to STARTING_RATING.
 */
export function replayPvpRatings(
  battles: ReplayableBattle[],
  options: { startRating?: number; K?: number } = {}
): Record<string, number> {
  const start = options.startRating ?? STARTING_RATING;
  const K = options.K ?? RATING_K_FACTOR;

  const rated = battles
    .filter(isRatedBattle)
    .map((b, index) => ({ b, index, t: new Date(b.completedAt as Date | string).getTime() }))
    // Stable: battles completed at the same instant keep their input order
    .sort((x, y) => x.t - y.t || x.index - y.index);

  const ratings: Record<string, number> = {};
  for (const { b } of rated) {
    const winnerId = b.winnerId as string;
    const loserId = winnerId === b.challengerId ? (b.defenderId as string) : b.challengerId;
    const { newWinnerRating, newLoserRating } = calculateNewRatings(
      ratings[winnerId] ?? start,
      ratings[loserId] ?? start,
      K
    );
    ratings[winnerId] = newWinnerRating;
    ratings[loserId] = newLoserRating;
  }
  return ratings;
}
