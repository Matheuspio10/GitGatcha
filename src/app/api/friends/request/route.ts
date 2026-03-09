import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { targetUsername } = await req.json();

    if (!targetUsername) {
      return NextResponse.json({ error: 'Target username is required' }, { status: 400 });
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (currentUser.username === targetUsername) {
      return NextResponse.json({ error: 'Cannot send a friend request to yourself' }, { status: 400 });
    }

    // Get target user
    const targetUser = await prisma.user.findUnique({
      where: { username: targetUsername },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Check if friendship or request already exists
    const existingFriendship1 = await prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: currentUser.id,
          friendId: targetUser.id,
        },
      },
    });

    const existingFriendship2 = await prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: targetUser.id,
          friendId: currentUser.id,
        },
      },
    });

    if (existingFriendship1 || existingFriendship2) {
      return NextResponse.json(
        { error: 'Friend request already sent or users are already friends' },
        { status: 400 }
      );
    }

    // Create friend request
    const friendship = await prisma.friendship.create({
      data: {
        userId: currentUser.id,
        friendId: targetUser.id,
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, friendship });
  } catch (error) {
    console.error('Error sending friend request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
