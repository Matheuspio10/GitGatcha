import { test } from 'node:test';
import assert from 'node:assert';
import { NOTIFICATIONS_KEPT, READ_NOTIFICATION_DAYS, pruneNotifications, type StoredNotification } from './notifications';

const now = new Date('2026-11-02T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const note = (id: string, days: number, read: boolean): StoredNotification => ({ id, type: 'card_gift', timestamp: daysAgo(days), read });

test('notifications: old read ones go, unread ones stay however old', () => {
  const list = [note('old-read', READ_NOTIFICATION_DAYS + 1, true), note('old-unread', 90, false), note('recent-read', 1, true)];
  assert.deepStrictEqual(pruneNotifications(list, now).map(n => n.id), ['old-unread', 'recent-read']);
});

test('notifications: past the cap, the oldest read go first, then the oldest unread', () => {
  const unread = Array.from({ length: NOTIFICATIONS_KEPT }, (_, i) => note(`u${i}`, i / 10, false));
  const read = [note('r-new', 0, true), note('r-old', 2, true)];
  const kept = pruneNotifications([...read, ...unread], now);
  assert.strictEqual(kept.length, NOTIFICATIONS_KEPT);
  assert.ok(!kept.some(n => n.read), 'read ones dropped before any unread');

  const tooMany = [...unread, note('u-extra', 0, false)];
  const trimmed = pruneNotifications(tooMany, now).map(n => n.id);
  assert.strictEqual(trimmed.length, NOTIFICATIONS_KEPT);
  assert.ok(!trimmed.includes(`u${NOTIFICATIONS_KEPT - 1}`), 'the oldest unread goes');
  assert.strictEqual(trimmed[trimmed.length - 1], 'u-extra', 'order is kept');
});

test('notifications: a short list is left alone', () => {
  const list = [note('a', 0, false), note('b', 3, true)];
  assert.deepStrictEqual(pruneNotifications(list, now), list);
});
