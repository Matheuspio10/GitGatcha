import { test } from 'node:test';
import assert from 'node:assert';
import { FEED_LIMIT, isFeedPull, mergeFeed, type FeedEvent } from './activityFeed';

const user = { username: 'ana', image: null };
const tower = (id: string, at: string): FeedEvent => ({ id, type: 'tower', at, user, theme: 'Rust' });

test('only Epic or better, or a Shiny Rare or better, is news', () => {
  assert.ok(isFeedPull('Epic', false));
  assert.ok(isFeedPull('Legendary', false));
  assert.ok(isFeedPull('Rare', true));
  assert.ok(!isFeedPull('Rare', false));
  assert.ok(!isFeedPull('Common', true));
  assert.ok(!isFeedPull('Uncommon', true));
});

test('merges every source newest first, with a stable order on ties', () => {
  const merged = mergeFeed([
    [tower('b', '2026-10-14T10:00:00.000Z'), tower('d', '2026-10-12T10:00:00.000Z')],
    [tower('c', '2026-10-13T10:00:00.000Z'), tower('a', '2026-10-14T10:00:00.000Z')],
  ]);
  assert.deepStrictEqual(merged.map(e => e.id), ['a', 'b', 'c', 'd']);
});

test('keeps only the newest FEED_LIMIT events', () => {
  const many = Array.from({ length: FEED_LIMIT + 5 }, (_, i) => tower(`e${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()));
  const merged = mergeFeed([many]);
  assert.strictEqual(merged.length, FEED_LIMIT);
  assert.strictEqual(merged[0].id, `e${FEED_LIMIT + 4}`);
});
