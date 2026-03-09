import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET: Fetch battle history for the current user
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const take = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const skip = parseInt(searchParams.get('offset') || '0');

    const battles = await prisma.battle.findMany({
      where: {
        status: 'COMPLETED',
        OR: [
          { challengerId: userId },
          { defenderId: userId },
        ],
      },
      include: {
        challenger: { select: { id: true, username: true, image: true } },
        defender: { select: { id: true, username: true, image: true } },
        challengerCard: true,
        defenderCard: true,
        rounds: { orderBy: { roundNum: 'asc' } },
      },
      orderBy: { completedAt: 'desc' },
      take,
      skip,
    });

    const total = await prisma.battle.count({
      where: {
        status: 'COMPLETED',
        OR: [
          { challengerId: userId },
          { defenderId: userId },
        ],
      },
    });

    return NextResponse.json({ battles, total, hasMore: skip + take < total });

  } catch (error) {
    console.error('Battle history error:', error);
    return NextResponse.json({ error: 'Failed to fetch battle history' }, { status: 500 });
  }
}
