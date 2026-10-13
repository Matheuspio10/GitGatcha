/**
 * Ranked tiers (elos) from the PvP rating (pure, client-safe). Everyone starts
 * at STARTING_RATING, which is the bottom of Bronze; with K = 32 an even win
 * is worth ~16 points.
 */
import { STARTING_RATING } from './battleConfig';

export interface RankTier {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  name: string;
  /** Lowest rating of the tier. */
  min: number;
  color: string;
}

export const RANK_TIERS: readonly RankTier[] = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#c58b5a' },
  { id: 'silver', name: 'Silver', min: STARTING_RATING + 50, color: '#c7cbd6' },
  { id: 'gold', name: 'Gold', min: STARTING_RATING + 150, color: '#ffc84a' },
  { id: 'platinum', name: 'Platinum', min: STARTING_RATING + 300, color: '#5ee0d2' },
  { id: 'diamond', name: 'Diamond', min: STARTING_RATING + 450, color: '#8fb8ff' },
];

export function rankForRating(rating: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) if (rating >= t.min) tier = t;
  return tier;
}

/** Progress inside the tier (0..1) and the rating of the next tier, for progress bars. */
export function rankProgress(rating: number): { tier: RankTier; next: RankTier | null; progress: number } {
  const tier = rankForRating(rating);
  const next = RANK_TIERS[RANK_TIERS.indexOf(tier) + 1] ?? null;
  if (!next) return { tier, next, progress: 1 };
  const floor = tier.min === 0 ? STARTING_RATING - 100 : tier.min;
  return { tier, next, progress: Math.min(1, Math.max(0, (rating - floor) / (next.min - floor))) };
}

/**
 * Rating window used to find a ranked opponent: ±100 first, then wider when
 * nobody is that close (few players).
 */
export const RANKED_SEARCH_WINDOWS = [100, 200, 400, Infinity] as const;
