import { test } from 'node:test';
import assert from 'node:assert';
import { RANK_TIERS, rankForRating, rankProgress } from './ranks';
import { STARTING_RATING } from './battleConfig';

test('new players start in Bronze and tiers go up with rating', () => {
  assert.strictEqual(rankForRating(STARTING_RATING).id, 'bronze');
  assert.strictEqual(rankForRating(0).id, 'bronze');
  for (const tier of RANK_TIERS) {
    assert.strictEqual(rankForRating(tier.min).id, tier.id);
  }
  assert.strictEqual(rankForRating(99999).id, 'diamond');
});

test('progress runs from 0 to 1 inside a tier; Diamond is full', () => {
  const silver = RANK_TIERS[1];
  const gold = RANK_TIERS[2];
  assert.strictEqual(rankProgress(silver.min).progress, 0);
  assert.ok(rankProgress(gold.min - 1).progress > 0.9);
  assert.strictEqual(rankProgress(gold.min - 1).next?.id, 'gold');
  assert.deepStrictEqual([rankProgress(99999).progress, rankProgress(99999).next], [1, null]);
});
