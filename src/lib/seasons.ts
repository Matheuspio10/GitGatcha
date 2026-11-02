/**
 * Ranked seasons (pure, client-safe). A season is a calendar month (UTC).
 * During it, the first time a player reaches a rank pays PROMOTION_BITS; when
 * it ends, everyone who played PvP that season gets SEASON_REWARD_BITS for the
 * best rank they reached (their peak), and every rating is softly reset
 * halfway towards STARTING_RATING.
 */
import { RATING_K_FACTOR, STARTING_RATING } from './battleConfig';
import { RANK_TIERS, rankForRating, type RankTier } from './ranks';

type TierId = RankTier['id'];

/** First time a rank is reached in a season (Bronze is where everyone starts). */
export const PROMOTION_BITS: Record<TierId, number> = {
  bronze: 0,
  silver: 100,
  gold: 200,
  platinum: 400,
  diamond: 800,
};

/** End of season, by the peak rank of the season (players with at least one PvP battle). */
export const SEASON_REWARD_BITS: Record<TierId, number> = {
  bronze: 100,
  silver: 200,
  gold: 400,
  platinum: 700,
  diamond: 1200,
};

/**
 * Placement: a player's first PLACEMENT_BATTLES rated battles of each season
 * move their own rating PLACEMENT_K_MULTIPLIER times as much, so a soft-reset
 * (or brand new) rating quickly finds its level. The opponent's rating moves
 * by their own K.
 */
export const PLACEMENT_BATTLES = 5;
export const PLACEMENT_K_MULTIPLIER = 2;

/** K for a player who has already played `seasonBattles` rated battles this season. */
export function ratingKFor(seasonBattles: number, K: number = RATING_K_FACTOR, placementBattles: number = PLACEMENT_BATTLES): number {
  return seasonBattles < placementBattles ? K * PLACEMENT_K_MULTIPLIER : K;
}

/** Rating at the start of the next season: halfway back to STARTING_RATING. */
export function softResetRating(rating: number): number {
  return STARTING_RATING + Math.round((rating - STARTING_RATING) / 2);
}

/** A season that starts at `start` ends at the first day of the next month, 00:00 UTC. */
export function seasonEndFor(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/** Ranks newly reached when the season peak goes from `oldPeak` to `newPeak` (lowest first). */
export function ranksReached(oldPeak: number, newPeak: number): RankTier[] {
  if (newPeak <= oldPeak) return [];
  return RANK_TIERS.filter(t => t.min > oldPeak && t.min <= newPeak && t.min > 0);
}

export function seasonRewardFor(peakRating: number): { tier: RankTier; bits: number } {
  const tier = rankForRating(peakRating);
  return { tier, bits: SEASON_REWARD_BITS[tier.id] };
}

/** "18d 4h" until the season ends. */
export function formatSeasonLeft(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}
