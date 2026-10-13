import { test } from 'node:test';
import assert from 'node:assert';
import { COLLECTOR_POINTS, collectorPoints } from './collectorScore';

test('collector points weight unique cards by rarity', () => {
  assert.strictEqual(collectorPoints({}), 0);
  assert.strictEqual(collectorPoints({ Common: 10 }), 10 * COLLECTOR_POINTS.Common);
  assert.strictEqual(
    collectorPoints({ Common: 2, Legendary: 1, Unknown: 5 }),
    2 * COLLECTOR_POINTS.Common + COLLECTOR_POINTS.Legendary,
  );
});

test('rarer tiers are always worth more', () => {
  const values = Object.values(COLLECTOR_POINTS);
  assert.ok(values.every((v, i) => i === 0 || v > values[i - 1]));
});
