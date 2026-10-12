import { test } from 'node:test';
import assert from 'node:assert';
import { sortLeaderboard } from './leaderboard';

test('sortLeaderboard: rating, then PvP wins, then battles, then oldest account', () => {
  const rows = [
    { id: 'newer', rating: 1000, pvpWins: 2, totalBattles: 10, createdAt: '2026-05-01T00:00:00Z' },
    { id: 'older', rating: 1000, pvpWins: 2, totalBattles: 10, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'more-battles', rating: 1000, pvpWins: 2, totalBattles: 30, createdAt: '2026-09-01T00:00:00Z' },
    { id: 'more-pvp', rating: 1000, pvpWins: 5, totalBattles: 1, createdAt: '2026-09-01T00:00:00Z' },
    { id: 'top', rating: 1100, pvpWins: 0, totalBattles: 1, createdAt: '2026-09-01T00:00:00Z' },
  ];
  assert.deepStrictEqual(sortLeaderboard(rows).map(r => r.id), ['top', 'more-pvp', 'more-battles', 'older', 'newer']);
  // Does not mutate the input
  assert.strictEqual(rows[0].id, 'newer');
});
