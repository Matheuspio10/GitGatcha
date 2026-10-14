import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { apiError, readBody } from '@/lib/apiResponse';
import { idSchema } from '@/lib/validation';
import { z } from 'zod';

const bodySchema = z.object({ requestId: idSchema.optional() }).optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user?.email) {
      return apiError('common.unauthorized', 401);
    }

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const requestId = body.data?.requestId;

    if (!requestId) {
      return apiError('friends.requestIdRequired');
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!currentUser) {
      return apiError('common.userNotFound', 404);
    }

    // Find the pending request where the current user is the friendId (recipient)
    const friendship = await prisma.friendship.findUnique({
      where: { id: requestId },
    });

    if (!friendship) {
      return apiError('friends.requestNotFound', 404);
    }

    if (friendship.friendId !== currentUser.id) {
      return apiError('friends.cannotAccept', 403);
    }

    if (friendship.status === 'ACCEPTED') {
      return apiError('friends.alreadyAccepted');
    }

    // Update status to ACCEPTED
    const updatedFriendship = await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    });

    return NextResponse.json({ success: true, friendship: updatedFriendship });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    return apiError('common.internal', 500);
  }
}
