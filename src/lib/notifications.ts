import { randomUUID } from 'node:crypto';
import { asArray, asJson, type Tx } from './userLock';
import type { StoredText } from './storedText';
import { englishText } from './storedTextEnglish';

/**
 * One entry of User.notifications (bell + toast). `text` is translated where it
 * is shown; `message` is its English sentence (the only text of entries written
 * before `text` existed). LEVEL_UP entries carry a payload instead.
 */
export interface StoredNotification {
  id: string;
  type: string;
  message?: string;
  text?: StoredText;
  actionUrl?: string;
  timestamp: string;
  read: boolean;
  payload?: unknown;
}

/** The list keeps at most this many entries… */
export const NOTIFICATIONS_KEPT = 50;
/** …and read ones only this long (the profile looks at level-ups of the last day). */
export const READ_NOTIFICATION_DAYS = 7;

/**
 * Trims the list so it can't grow forever: read entries older than
 * READ_NOTIFICATION_DAYS go, then the oldest (read first) past NOTIFICATIONS_KEPT.
 * Keeps the original order.
 */
export function pruneNotifications(list: StoredNotification[], now = new Date()): StoredNotification[] {
  const readCutoff = now.getTime() - READ_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000;
  const time = (n: StoredNotification) => Date.parse(n.timestamp) || 0;
  const kept = list.filter(n => !n.read || time(n) >= readCutoff);
  if (kept.length <= NOTIFICATIONS_KEPT) return kept;

  const dropFirst = [...kept].sort((a, b) => Number(b.read) - Number(a.read) || time(a) - time(b));
  const dropped = new Set(dropFirst.slice(0, kept.length - NOTIFICATIONS_KEPT));
  return kept.filter(n => !dropped.has(n));
}

/**
 * Appends a notification to the player's list (bell + toast). Run it inside
 * the player's lock / transaction: the list is a JSON column.
 */
export async function pushNotification(tx: Tx, userId: string, type: string, text: StoredText, actionUrl = '/') {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { notifications: true } });
  if (!user) return;
  const notifications = asArray<StoredNotification>(user.notifications);
  notifications.push({ id: randomUUID(), type, message: englishText(text), text, actionUrl, timestamp: new Date().toISOString(), read: false });
  await tx.user.update({ select: { id: true }, where: { id: userId }, data: { notifications: asJson(pruneNotifications(notifications)) } });
}
