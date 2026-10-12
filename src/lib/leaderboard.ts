export interface LeaderboardStats {
  rating: number;
  pvpWins: number;
  totalBattles: number;
  createdAt: Date | string;
}

/**
 * Leaderboard order: rating desc, then PvP wins desc, then total battles desc,
 * then the oldest account first. Ties are fully broken except for accounts
 * created at the same instant.
 */
export function compareLeaderboardEntries(a: LeaderboardStats, b: LeaderboardStats): number {
  return (
    b.rating - a.rating ||
    b.pvpWins - a.pvpWins ||
    b.totalBattles - a.totalBattles ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function sortLeaderboard<T extends LeaderboardStats>(entries: T[]): T[] {
  return [...entries].sort(compareLeaderboardEntries);
}
