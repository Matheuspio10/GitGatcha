import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateNewRatings, replayPvpRatings, ReplayableBattle } from './ratings';
import { STARTING_RATING } from './battleConfig';

const pvp = (
  challengerId: string,
  defenderId: string,
  winnerId: string,
  completedAt: string,
  over: Partial<ReplayableBattle> = {}
): ReplayableBattle => ({
  challengerId, defenderId, winnerId, status: 'COMPLETED', isRandom: false, completedAt, ...over,
});

describe('replayPvpRatings', () => {
  test('starts everyone at the starting rating and applies ELO', () => {
    const r = replayPvpRatings([pvp('a', 'b', 'a', '2026-01-01T00:00:00Z')]);
    const expected = calculateNewRatings(STARTING_RATING, STARTING_RATING);
    assert.deepStrictEqual(r, { a: expected.newWinnerRating, b: expected.newLoserRating });
    assert.deepStrictEqual(r, { a: 1016, b: 984 });
  });

  test('ignores PvE, unfinished and winner-less battles', () => {
    const r = replayPvpRatings([
      pvp('a', 'b', 'a', '2026-01-01T00:00:00Z', { isRandom: true }),
      { challengerId: 'a', defenderId: null, winnerId: 'a', status: 'COMPLETED', isRandom: true, completedAt: '2026-01-01T00:00:00Z' },
      pvp('a', 'b', 'a', '2026-01-02T00:00:00Z', { status: 'PENDING' }),
      pvp('a', 'b', 'a', '2026-01-02T00:00:00Z', { status: 'EXPIRED' }),
      pvp('a', 'b', '__SYSTEM__', '2026-01-03T00:00:00Z'),
      pvp('a', 'b', 'a', '2026-01-03T00:00:00Z', { completedAt: null }),
    ]);
    assert.deepStrictEqual(r, {});
  });

  test('replays in completedAt order regardless of input order', () => {
    const battles = [
      pvp('a', 'c', 'c', '2026-01-03T00:00:00Z'),
      pvp('a', 'b', 'a', '2026-01-01T00:00:00Z'),
      pvp('b', 'c', 'b', '2026-01-02T00:00:00Z'),
    ];
    // Manual replay in time order
    let a = STARTING_RATING, b = STARTING_RATING, c = STARTING_RATING;
    ({ newWinnerRating: a, newLoserRating: b } = calculateNewRatings(a, b));
    ({ newWinnerRating: b, newLoserRating: c } = calculateNewRatings(b, c));
    ({ newWinnerRating: c, newLoserRating: a } = calculateNewRatings(c, a));

    assert.deepStrictEqual(replayPvpRatings(battles), { a, b, c });
    assert.deepStrictEqual(replayPvpRatings([...battles].reverse()), { a, b, c });
  });

  test('accepts Date objects and custom start/K', () => {
    const r = replayPvpRatings(
      [pvp('a', 'b', 'b', '', { completedAt: new Date('2026-01-01T00:00:00Z') })],
      { startRating: 1200, K: 16 }
    );
    assert.deepStrictEqual(r, { a: 1192, b: 1208 });
  });

  test('ratings never go below 0', () => {
    const battles = Array.from({ length: 200 }, (_, i) =>
      pvp('a', 'b', 'a', new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
    const r = replayPvpRatings(battles, { startRating: 10 });
    assert.ok(r.b >= 0);
    assert.ok(r.a > r.b);
  });
});
