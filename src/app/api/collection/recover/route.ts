import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock } from '@/lib/userLock';
import { getCardStamina, STAMINA_RECOVERY_RATE_PER_HOUR, MAX_STAMINA } from '@/lib/staminaService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userCardId } = await req.json();

    if (!userCardId) {
      return NextResponse.json({ error: 'Missing userCardId' }, { status: 400 });
    }

    const userCard = await prisma.userCard.findUnique({
      where: { id: userCardId }
    });

    if (!userCard || userCard.userId !== userId) {
      return NextResponse.json({ error: 'Card not found or unowned' }, { status: 403 });
    }

    const updatedUserCard = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { currency: true } });
      if (!user || user.currency < 100) return null;

      await tx.user.update({
        where: { id: userId },
        data: { currency: { decrement: 100 } }
      });

      return tx.userCard.update({
        where: { id: userCardId },
        data: {
          stamina: 100,
          lastUsedAt: new Date()
        }
      });
    });

    if (!updatedUserCard) {
      return NextResponse.json({ error: 'Insufficient BITS' }, { status: 400 });
    }

    return NextResponse.json({ success: true, updatedUserCard });
  } catch (error) {
    console.error('Instant recover error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
