import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Handle GET to fetch which cards are currently marked as inActiveTeam.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const activeCards = await prisma.userCard.findMany({
      where: {
        userId,
        inActiveTeam: true
      },
      select: {
        id: true,
        cardId: true
      }
    });

    return NextResponse.json({ activeCards });
  } catch (error) {
    console.error('Fetch active team error:', error);
    return NextResponse.json({ error: 'Failed to fetch active team' }, { status: 500 });
  }
}

/**
 * Handle POST to update which cards are in active team.
 * The flag only remembers the last team picked in the team builder: it no
 * longer affects stamina (every card recovers over time), so stamina and
 * lastUsedAt are left untouched.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { cardIds } = await req.json(); // These are the global cardIds
    if (!Array.isArray(cardIds) || cardIds.length > 3 || cardIds.some(id => typeof id !== 'string')) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.userCard.updateMany({
        where: { userId, inActiveTeam: true, cardId: { notIn: cardIds } },
        data: { inActiveTeam: false },
      }),
      prisma.userCard.updateMany({
        where: { userId, inActiveTeam: false, cardId: { in: cardIds } },
        data: { inActiveTeam: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update active team error:', error);
    return NextResponse.json({ error: 'Failed to update active team' }, { status: 500 });
  }
}
