/**
 * Friends' activity feed ("Ana pulled a Legendary"), built from what the game
 * already stores with a date — nothing is written for it:
 * - pulls: cards that entered a collection (UserCard.createdAt), Epic or better, or a Shiny Rare;
 * - achievements: tiers unlocked (UserAchievement.unlockedAt);
 * - sprints: a podium finish (SprintResult, top 3);
 * - tower: the weekly Tower conquered (TowerRun.cleared at the top floor).
 * Pure part (rules and merging) here; the queries are in activityFeedService.ts.
 */

/** How far back the feed looks, and how many events it shows. */
export const FEED_WINDOW_DAYS = 14;
export const FEED_LIMIT = 40;
/** Sprint finishes shown in the feed: the podium. */
export const FEED_SPRINT_MAX_POSITION = 3;

export const FEED_PULL_RARITIES = ['Epic', 'Legendary'] as const;
/** Shiny cards of these rarities also count (a Shiny Common/Uncommon is too frequent to be news). */
export const FEED_SHINY_RARITIES = ['Rare', 'Epic', 'Legendary'] as const;

export function isFeedPull(rarity: string, isShiny: boolean): boolean {
  return (FEED_PULL_RARITIES as readonly string[]).includes(rarity)
    || (isShiny && (FEED_SHINY_RARITIES as readonly string[]).includes(rarity));
}

export interface FeedUser {
  username: string;
  image: string | null;
}

export type FeedEvent =
  | { id: string; type: 'pull'; at: string; user: FeedUser; login: string; name: string; rarity: string; shiny: boolean; avatarUrl: string | null }
  | { id: string; type: 'achievement'; at: string; user: FeedUser; achievementId: string; achievementName: string; tier: number }
  | { id: string; type: 'sprint'; at: string; user: FeedUser; kind: string; themeId: string; themeName: string; position: number }
  | { id: string; type: 'tower'; at: string; user: FeedUser; theme: string };

/** Newest first across every source, ties broken by id so the order is stable. */
export function mergeFeed(lists: FeedEvent[][], limit = FEED_LIMIT): FeedEvent[] {
  return lists
    .flat()
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1))
    .slice(0, limit);
}
