import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { apiError, readBody } from '@/lib/apiResponse';
import { z } from 'zod';

// The profile page sends the username from its URL
const bodySchema = z.object({ targetUsername: z.string().max(100).optional() }).optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return apiError('common.unauthorized', 401);
    }

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const targetUsername = body.data?.targetUsername;

    if (!targetUsername) {
      return apiError('friends.targetRequired');
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, username: true },
    });

    if (!currentUser) {
      return apiError('common.userNotFound', 404);
    }

    if (currentUser.username === targetUsername) {
      return apiError('friends.cannotAddSelf');
    }

    // Get target user
    const targetUser = await prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });

    if (!targetUser) {
      return apiError('friends.targetNotFound', 404);
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
      return apiError('friends.alreadyRequested');
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
    return apiError('common.internal', 500);
  }
}
