import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get where user sent request and it was accepted, or where user received request and accepted it
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId: currentUser.id, status: 'ACCEPTED' },
          { friendId: currentUser.id, status: 'ACCEPTED' },
        ],
      },
      include: {
        user: { select: { id: true, username: true, level: true } },
        friend: { select: { id: true, username: true, level: true } },
      },
    });

    // Format friends list to normalize who is the friend
    const friends = friendships.map(f => {
      const isCurrentUserSender = f.userId === currentUser.id;
      const friendData = isCurrentUserSender ? f.friend : f.user;
      
      return {
        friendshipId: f.id,
        user: friendData,
        createdAt: f.createdAt,
      };
    });

    // Pending incoming requests
    const pendingRequests = await prisma.friendship.findMany({
      where: {
        friendId: currentUser.id,
        status: 'PENDING',
      },
      include: {
        user: { select: { id: true, username: true, level: true } },
      },
    });

    // Pending outgoing requests
    const outgoingRequests = await prisma.friendship.findMany({
      where: {
        userId: currentUser.id,
        status: 'PENDING',
      },
      include: {
        friend: { select: { id: true, username: true, level: true } },
      },
    });

    return NextResponse.json({ 
      friends, 
      pendingRequests: pendingRequests.map(r => ({ id: r.id, user: r.user, createdAt: r.createdAt })),
      outgoingRequests: outgoingRequests.map(r => ({ id: r.id, user: r.friend, createdAt: r.createdAt })) 
    });
  } catch (error) {
    console.error('Error fetching friends:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
