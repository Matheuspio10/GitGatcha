import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { claimDailyReward, getDailyStatus } from '@/lib/economyService';
import { enforceRateLimit } from '@/lib/rateLimit';
import { syncAchievementsSafe } from '@/lib/achievementService';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const status = await getDailyStatus(userId);
    if (!status) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // canClaim / remainingMs kept at the top level for older clients; `streak` drives the 7-day calendar
    return NextResponse.json({ canClaim: status.canClaim, remainingMs: status.remainingMs, streak: status });
  } catch (error) {
    console.error('Daily status error:', error);
    return NextResponse.json({ error: 'Failed to check daily status' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limited = await enforceRateLimit(req, 'store-daily', 10, 60, userId);
    if (limited) return limited;

    const result = await claimDailyReward(userId);
    // The claim's XP can level the player up (Veteran achievement)
    const achievementsUnlocked = result.success ? await syncAchievementsSafe(userId) : [];
    return NextResponse.json({ ...result, achievementsUnlocked });

  } catch (error) {
    console.error('Daily reward error:', error);
    return NextResponse.json({ error: 'Failed to claim daily reward' }, { status: 500 });
  }
}
