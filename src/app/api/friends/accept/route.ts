import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the pending request where the current user is the friendId (recipient)
    const friendship = await prisma.friendship.findUnique({
      where: { id: requestId },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'Friend request not found' }, { status: 404 });
    }

    if (friendship.friendId !== currentUser.id) {
      return NextResponse.json({ error: 'Unauthorized to accept this request' }, { status: 403 });
    }

    if (friendship.status === 'ACCEPTED') {
      return NextResponse.json({ error: 'Friend request already accepted' }, { status: 400 });
    }

    // Update status to ACCEPTED
    const updatedFriendship = await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    });

    return NextResponse.json({ success: true, friendship: updatedFriendship });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
