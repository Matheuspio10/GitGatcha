import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { apiError, readBody } from '@/lib/apiResponse';
import { idSchema } from '@/lib/validation';
import { z } from 'zod';

const bodySchema = z.object({ friendshipId: idSchema.optional() }).optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return apiError('common.unauthorized', 401);
    }

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const friendshipId = body.data?.friendshipId;

    if (!friendshipId) {
      return apiError('friends.friendshipIdRequired');
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!currentUser) {
      return apiError('common.userNotFound', 404);
    }

    // Find the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return apiError('friends.friendshipNotFound', 404);
    }

    // Ensure the user is part of the friendship
    if (friendship.userId !== currentUser.id && friendship.friendId !== currentUser.id) {
      return apiError('friends.cannotRemove', 403);
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing friend:', error);
    return apiError('common.internal', 500);
  }
}
