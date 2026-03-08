import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { claimDailyReward } from '@/lib/economyService';
import { prisma } from '@/lib/prisma';

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastDailyClaimAt: true }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const now = Date.now();
    if (user.lastDailyClaimAt) {
      const timeSinceLast = now - user.lastDailyClaimAt.getTime();
      if (timeSinceLast < DAILY_COOLDOWN_MS) {
        return NextResponse.json({
          canClaim: false,
          remainingMs: DAILY_COOLDOWN_MS - timeSinceLast,
        });
      }
    }

    return NextResponse.json({ canClaim: true, remainingMs: 0 });
  } catch (error) {
    console.error('Daily status error:', error);
    return NextResponse.json({ error: 'Failed to check daily status' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await claimDailyReward(userId);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Daily reward error:', error);
    return NextResponse.json({ error: 'Failed to claim daily reward' }, { status: 500 });
  }
}
