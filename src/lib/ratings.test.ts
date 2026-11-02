import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateNewRatings, replayPvpRatings, ReplayableBattle } from './ratings';
import { RATING_K_FACTOR, STARTING_RATING } from './battleConfig';
import { PLACEMENT_BATTLES, PLACEMENT_K_MULTIPLIER, softResetRating } from './seasons';

/** Plain ELO, without placement */
const ELO = { placementBattles: 0 };

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
    const r = replayPvpRatings([pvp('a', 'b', 'a', '2026-01-01T00:00:00Z')], ELO);
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

    assert.deepStrictEqual(replayPvpRatings(battles, ELO), { a, b, c });
    assert.deepStrictEqual(replayPvpRatings([...battles].reverse(), ELO), { a, b, c });
  });

  test('accepts Date objects and custom start/K', () => {
    const r = replayPvpRatings(
      [pvp('a', 'b', 'b', '', { completedAt: new Date('2026-01-01T00:00:00Z') })],
      { startRating: 1200, K: 16, ...ELO }
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

  test('placement: each player\'s first battles of a season use the bigger K', () => {
    const big = RATING_K_FACTOR * PLACEMENT_K_MULTIPLIER;
    // Two newcomers: both in placement
    assert.deepStrictEqual(replayPvpRatings([pvp('a', 'b', 'a', '2026-01-01T00:00:00Z')]), { a: 1000 + big / 2, b: 1000 - big / 2 });

    // A veteran (placement done) beats a newcomer: only the newcomer moves double
    const warmup = Array.from({ length: PLACEMENT_BATTLES }, (_, i) =>
      pvp('v', `x${i}`, i % 2 ? 'v' : `x${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
    const before = replayPvpRatings(warmup);
    const after = replayPvpRatings([...warmup, pvp('v', 'n', 'v', '2026-01-02T00:00:00Z')]);
    const expected = calculateNewRatings(before.v, STARTING_RATING, RATING_K_FACTOR, big);
    assert.strictEqual(after.v, expected.newWinnerRating);
    assert.strictEqual(after.n, expected.newLoserRating);
  });

  test('season resets: ratings go halfway back and placement starts again', () => {
    const battles = Array.from({ length: 8 }, (_, i) => pvp('a', 'b', 'a', new Date(Date.UTC(2026, 0, 1 + i)).toISOString()));
    const reset = '2026-01-06T00:00:00Z'; // after 5 battles
    const firstSeason = replayPvpRatings(battles.slice(0, 5));
    const r = replayPvpRatings(battles, { seasonResets: [reset] });
    // Manual: reset after battle 5, then 3 more battles, all in placement again
    let a = softResetRating(firstSeason.a), b = softResetRating(firstSeason.b);
    const big = RATING_K_FACTOR * PLACEMENT_K_MULTIPLIER;
    for (let i = 0; i < 3; i++) ({ newWinnerRating: a, newLoserRating: b } = calculateNewRatings(a, b, big));
    assert.deepStrictEqual(r, { a, b });
  });

  test('season resets after the last battle still apply', () => {
    const one = replayPvpRatings([pvp('a', 'b', 'a', '2026-01-01T00:00:00Z')]);
    const r = replayPvpRatings([pvp('a', 'b', 'a', '2026-01-01T00:00:00Z')], { seasonResets: ['2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z'] });
    assert.deepStrictEqual(r, { a: softResetRating(softResetRating(one.a)), b: softResetRating(softResetRating(one.b)) });
  });
});
