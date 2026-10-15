import { randomUUID } from 'node:crypto';
import { asArray, asJson, type Tx } from './userLock';

/** One entry of User.notifications (bell + toast). LEVEL_UP entries carry a payload instead of a message. */
export interface StoredNotification {
  id: string;
  type: string;
  message?: string;
  actionUrl?: string;
  timestamp: string;
  read: boolean;
  payload?: unknown;
}

/**
 * Appends a notification to the player's list (bell + toast). Run it inside
 * the player's lock / transaction: the list is a JSON column.
 */
export async function pushNotification(tx: Tx, userId: string, type: string, message: string, actionUrl = '/') {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { notifications: true } });
  if (!user) return;
  const notifications = asArray<StoredNotification>(user.notifications);
  notifications.push({ id: randomUUID(), type, message, actionUrl, timestamp: new Date().toISOString(), read: false });
  await tx.user.update({ select: { id: true }, where: { id: userId }, data: { notifications: asJson(notifications) } });
}
