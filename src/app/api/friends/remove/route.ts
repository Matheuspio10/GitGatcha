import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { friendshipId } = await req.json();

    if (!friendshipId) {
      return NextResponse.json({ error: 'Friendship ID is required' }, { status: 400 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'Friendship not found' }, { status: 404 });
    }

    // Ensure the user is part of the friendship
    if (friendship.userId !== currentUser.id && friendship.friendId !== currentUser.id) {
      return NextResponse.json({ error: 'Unauthorized to remove this friend' }, { status: 403 });
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing friend:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
