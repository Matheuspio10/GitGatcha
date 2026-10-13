import { test } from 'node:test';
import assert from 'node:assert';
import { PROMOTION_BITS, SEASON_REWARD_BITS, ranksReached, seasonEndFor, seasonRewardFor, softResetRating } from './seasons';
import { RANK_TIERS } from './ranks';
import { STARTING_RATING } from './battleConfig';

test('soft reset moves every rating halfway back to the start', () => {
  assert.strictEqual(softResetRating(STARTING_RATING), STARTING_RATING);
  assert.strictEqual(softResetRating(STARTING_RATING + 400), STARTING_RATING + 200);
  assert.strictEqual(softResetRating(STARTING_RATING - 100), STARTING_RATING - 50);
});

test('a season ends on the first day of the next month (UTC), across years too', () => {
  assert.strictEqual(seasonEndFor(new Date('2026-10-13T16:00:00Z')).toISOString(), '2026-11-01T00:00:00.000Z');
  assert.strictEqual(seasonEndFor(new Date('2026-12-01T00:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});

test('climbing past several ranks at once pays each of them, once', () => {
  const [, silver, gold] = RANK_TIERS;
  assert.deepStrictEqual(ranksReached(STARTING_RATING, gold.min).map(t => t.id), ['silver', 'gold']);
  assert.deepStrictEqual(ranksReached(gold.min, gold.min + 10), []);
  assert.deepStrictEqual(ranksReached(silver.min, silver.min - 30), []);
});

test('rewards grow with the rank', () => {
  const ids = RANK_TIERS.map(t => t.id);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(SEASON_REWARD_BITS[ids[i]] > SEASON_REWARD_BITS[ids[i - 1]]);
    assert.ok(PROMOTION_BITS[ids[i]] > PROMOTION_BITS[ids[i - 1]]);
  }
  assert.strictEqual(seasonRewardFor(STARTING_RATING).tier.id, 'bronze');
});
