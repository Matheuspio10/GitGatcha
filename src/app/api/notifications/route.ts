import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Pending incoming friend requests
    const friendRequests = await prisma.friendship.findMany({
      where: {
        friendId: userId,
        status: 'PENDING',
      },
      include: {
        user: { select: { id: true, username: true, level: true } },
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
        challenger: { select: { id: true, username: true } },
        challengerCard: true, // optional now
      },
      orderBy: { createdAt: 'desc' },
    });

    const notifications = [
      ...friendRequests.map(fr => ({
        id: fr.id,
        type: 'friend_request' as const,
        from: fr.user.username || 'Unknown',
        message: `${fr.user.username} wants to be your friend`,
        actionUrl: '/friends',
        createdAt: fr.createdAt,
      })),
      ...battleChallenges.map(bc => ({
        id: bc.id,
        type: 'battle_challenge' as const,
        from: bc.challenger.username || 'Unknown',
        message: `${bc.challenger.username} challenged you to a 3v3 battle!`,
        actionUrl: '/battle',
        createdAt: bc.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ notifications, count: notifications.length });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
