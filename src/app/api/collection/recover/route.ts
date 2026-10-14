import { NextResponse } from 'next/server';
import { spendBits } from '@/lib/bitsLedger';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock } from '@/lib/userLock';
import { getCardStamina, STAMINA_RECOVERY_RATE_PER_HOUR, MAX_STAMINA } from '@/lib/staminaService';
import { apiError, readBody } from '@/lib/apiResponse';
import { idSchema } from '@/lib/validation';
import { z } from 'zod';

const bodySchema = z.object({ userCardId: idSchema.optional() }).optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return apiError('common.unauthorized', 401);
    }

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const userCardId = body.data?.userCardId;

    if (!userCardId) {
      return apiError('collection.userCardIdMissing');
    }

    const userCard = await prisma.userCard.findUnique({
      where: { id: userCardId }
    });

    if (!userCard || userCard.userId !== userId) {
      return apiError('collection.cardNotOwned', 403);
    }

    const updatedUserCard = await withUserLock(userId, async (tx) => {
      const paid = await spendBits(userId, 100, 'stamina_recover', { tx });
      if (paid === null) return null;

      return tx.userCard.update({
        where: { id: userCardId },
        data: {
          stamina: 100,
          lastUsedAt: new Date()
        }
      });
    });

    if (!updatedUserCard) {
      return apiError('common.notEnoughBits');
    }

    return NextResponse.json({ success: true, updatedUserCard });
  } catch (error) {
    console.error('Instant recover error:', error);
    return apiError('common.internal', 500);
  }
}
