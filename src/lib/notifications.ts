import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { asArray, type Tx } from './userLock';

/**
 * Appends a notification to the player's list (bell + toast). Run it inside
 * the player's lock / transaction: the list is a JSON column.
 */
export async function pushNotification(tx: Tx, userId: string, type: string, message: string, actionUrl = '/') {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { notifications: true } });
  if (!user) return;
  const notifications = asArray(user.notifications);
  notifications.push({ id: randomUUID(), type, message, actionUrl, timestamp: new Date().toISOString(), read: false });
  await tx.user.update({ where: { id: userId }, data: { notifications: notifications as Prisma.InputJsonValue } });
}
