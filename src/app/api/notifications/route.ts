import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { asArray, asJson, withUserLock } from '@/lib/userLock';
import type { StoredNotification } from '@/lib/notifications';
import { apiError, readBody } from '@/lib/apiResponse';
import { z } from 'zod';

// The bell sends { notificationId, markAll }: one notification, or all of them
const bodySchema = z.object({
  notificationId: z.string().max(100).nullable().optional(),
  markAll: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifications: true, pendingRewards: true }
    });

    if (!dbUser) return apiError('common.userNotFound', 404);

    // Pending incoming friend requests
    const friendRequests = await prisma.friendship.findMany({
      where: {
        friendId: userId,
        status: 'PENDING',
      },
      include: {
        user: { select: { id: true, username: true, name: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Pending incoming battle challenges
    const battleChallenges = await prisma.battle.findMany({
      where: {
        defenderId: userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        challenger: { select: { id: true, username: true, name: true } },
        challengerCard: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const standardNotifications = [
      ...friendRequests.map(fr => {
        const friendDisplayName = fr.user.username || fr.user.name || 'Unknown';
        return {
          id: fr.id,
          type: 'friend_request' as const,
          from: friendDisplayName,
          message: `${friendDisplayName} wants to be your friend`,
          actionUrl: '/friends',
          createdAt: fr.createdAt,
          read: false,
        };
      }),
      ...battleChallenges.map(bc => {
        const challengerDisplayName = bc.challenger.username || bc.challenger.name || 'Unknown';
        return {
          id: bc.id,
          type: 'battle_challenge' as const,
          from: challengerDisplayName,
          message: `${challengerDisplayName} challenged you to a 3v3 battle!`,
          actionUrl: '/battle',
          createdAt: bc.createdAt,
          read: false,
        };
      }),
    ];

    const unreadDbNotifications = asArray<StoredNotification>(dbUser.notifications)
      .filter(n => !n.read)
      .map(n => ({ ...n, createdAt: new Date(n.timestamp) }));

    const allNotifications = [...standardNotifications, ...unreadDbNotifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ 
      notifications: allNotifications, 
      count: allNotifications.length,
      pendingRewards: dbUser.pendingRewards || [] 
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return apiError('common.internal', 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const body = await readBody(request, bodySchema);
    if (!body.ok) return body.response;
    const { notificationId, markAll } = body.data;

    // Locked: grantXP may be appending a LEVEL_UP notification at the same time
    const updatedNotifications = await withUserLock(userId, async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: userId },
        select: { notifications: true }
      });
      if (!dbUser) return null;

      let notifications = asArray<StoredNotification>(dbUser.notifications);
      if (markAll) {
        notifications = notifications.map(n => ({ ...n, read: true }));
      } else if (notificationId) {
        notifications = notifications.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        );
      }

      await tx.user.update({
        select: { id: true },
        where: { id: userId },
        data: { notifications: asJson(notifications) }
      });
      return notifications;
    });

    if (!updatedNotifications) return apiError('common.userNotFound', 404);

    return NextResponse.json({ success: true, count: updatedNotifications.filter(n => !n.read).length });

  } catch (error) {
    console.error('Error updating notifications:', error);
    return apiError('notifications.updateFailed', 500);
  }
}
