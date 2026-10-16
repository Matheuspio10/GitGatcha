import { SPRINT_REWARDS } from './sprints';

/**
 * The Dev League (Cartola-style): the rules and numbers, client-safe. Each
 * week players pick 5 real developers (any card in the game) within a budget;
 * the developers score with what they did on GitHub that week. Plan and the
 * decisions behind every number: docs/liga-cartola.md. The database side is
 * leagueService.ts.
 */

// ─── Rounds ─────────────────────────────────────────────────────────────────

export const LEAGUE_ROUND_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** GitHub can show activity a few hours late: a round is scored and paid this long after it ends. */
export const LEAGUE_CLOSE_DELAY_HOURS = 6;

/** Monday 00:00 UTC of the week `date` is in: the start of its round. */
export function roundStartOf(date: Date): Date {
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
}

export function roundEndOf(start: Date): Date {
  return new Date(start.getTime() + LEAGUE_ROUND_DAYS * DAY_MS);
}

/** "2026-10-19": the round id is its Monday. */
export function roundIdOf(start: Date): string {
  return start.toISOString().slice(0, 10);
}

/** The round being played now and the one whose lineups are open (it starts next Monday). */
export function currentAndNextRound(now: Date) {
  const current = roundStartOf(now);
  return { current, next: roundEndOf(current) };
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/** A developer's GitHub activity in one window (GraphQL contributionsCollection). */
export interface ContributionCounts {
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  /** Days with any contribution, private ones included (the calendar shows them). */
  activeDays: number;
}

/** Points per unit and the weekly cap on the units that count (L4). Private activity counts only through active days (L5). */
export const LEAGUE_SCORING: Record<keyof ContributionCounts, { points: number; cap: number }> = {
  commits: { points: 1, cap: 40 },
  pullRequests: { points: 5, cap: 10 },
  reviews: { points: 3, cap: 10 },
  issues: { points: 2, cap: 10 },
  activeDays: { points: 3, cap: 7 },
};

const STATS = Object.keys(LEAGUE_SCORING) as (keyof ContributionCounts)[];

/** Points for `weeks` weeks of activity (the caps scale with the window). */
export function scoreActivity(counts: ContributionCounts, weeks = 1): number {
  return STATS.reduce((sum, k) => sum + Math.min(counts[k], LEAGUE_SCORING[k].cap * weeks) * LEAGUE_SCORING[k].points, 0);
}

export const LEAGUE_MAX_DEV_POINTS = scoreActivity(
  Object.fromEntries(STATS.map(k => [k, LEAGUE_SCORING[k].cap])) as unknown as ContributionCounts,
);

// ─── Market ─────────────────────────────────────────────────────────────────

/** Weeks of form behind a price (L2). */
export const LEAGUE_FORM_WEEKS = 3;
export const LEAGUE_PRICE_MIN = 2;
export const LEAGUE_PRICE_MAX = 20;
/** Every LEAGUE_PRICE_STEP points of weekly form add C$ 1. */
export const LEAGUE_PRICE_STEP = 8;
export const LEAGUE_BUDGET = 50;

/** C$ for a developer whose average weekly points are `form`: an idle one costs the minimum. */
export function priceFromForm(form: number): number {
  const raw = Math.round(LEAGUE_PRICE_MIN + Math.max(0, form) / LEAGUE_PRICE_STEP);
  return Math.min(LEAGUE_PRICE_MAX, Math.max(LEAGUE_PRICE_MIN, raw));
}

// ─── Lineup ─────────────────────────────────────────────────────────────────

export const LEAGUE_TEAM_SIZE = 5;
/** The captain's points count this many times (L8). */
export const LEAGUE_CAPTAIN_MULTIPLIER = 2;
/** Owning the card of a picked developer (L3): +10%, +20% when it is Shiny. */
export const LEAGUE_OWNED_BONUS = 0.1;
export const LEAGUE_SHINY_BONUS = 0.2;

/** Why a lineup can't be saved (a key of apiErrors.league), or null. */
export type LineupError = 'teamSize' | 'duplicate' | 'notOnMarket' | 'self' | 'captain' | 'budget';

export function lineupError(
  lineup: { cardIds: string[]; captainId: string },
  prices: ReadonlyMap<string, number>,
  selfCardId: string | null,
): LineupError | null {
  const { cardIds, captainId } = lineup;
  if (cardIds.length !== LEAGUE_TEAM_SIZE) return 'teamSize';
  if (new Set(cardIds).size !== cardIds.length) return 'duplicate';
  if (cardIds.some(id => !prices.has(id))) return 'notOnMarket';
  // Your own GitHub account: you'd score by pushing commits (L6)
  if (selfCardId && cardIds.includes(selfCardId)) return 'self';
  if (!cardIds.includes(captainId)) return 'captain';
  if (lineupCost(cardIds, prices) > LEAGUE_BUDGET) return 'budget';
  return null;
}

export function lineupCost(cardIds: string[], prices: ReadonlyMap<string, number>): number {
  return cardIds.reduce((sum, id) => sum + (prices.get(id) ?? 0), 0);
}

/** How the player holds a picked developer's card, if at all. */
export type Ownership = 'none' | 'owned' | 'shiny';

/** One developer's points in a lineup: the collection bonus, then the captain. */
export function lineupDevPoints(devPoints: number, captain: boolean, owned: Ownership): number {
  const bonus = owned === 'shiny' ? LEAGUE_SHINY_BONUS : owned === 'owned' ? LEAGUE_OWNED_BONUS : 0;
  return Math.round(devPoints * (1 + bonus) * (captain ? LEAGUE_CAPTAIN_MULTIPLIER : 1));
}

export function lineupPoints(
  lineup: { cardIds: string[]; captainId: string },
  devPoints: ReadonlyMap<string, number>,
  owned: ReadonlyMap<string, Ownership>,
): number {
  return lineup.cardIds.reduce((sum, id) =>
    sum + lineupDevPoints(devPoints.get(id) ?? 0, id === lineup.captainId, owned.get(id) ?? 'none'), 0);
}

// ─── Prizes ─────────────────────────────────────────────────────────────────

/** BITS for every full lineup in a closed round (L10). */
export const LEAGUE_PARTICIPATION_BITS = 50;
/** Global top: the same table as the weekly Sprint (L10). Tied players share the position and the prize. */
export const LEAGUE_REWARDS = SPRINT_REWARDS.weekly;

export function leagueRewardFor(position: number): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  return LEAGUE_REWARDS.find(r => position <= r.upTo)?.bits ?? 0;
}
