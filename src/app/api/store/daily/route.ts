import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { claimDailyReward, getDailyStatus } from '@/lib/economyService';
import { enforceRateLimit } from '@/lib/rateLimit';
import { syncAchievementsSafe } from '@/lib/achievementService';
import { apiError, errorMessage } from '@/lib/apiResponse';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const status = await getDailyStatus(userId);
    if (!status) return apiError('common.userNotFound', 404);

    // canClaim / remainingMs kept at the top level for older clients; `streak` drives the 7-day calendar
    return NextResponse.json({ canClaim: status.canClaim, remainingMs: status.remainingMs, streak: status });
  } catch (error) {
    console.error('Daily status error:', error);
    return apiError('store.dailyStatusFailed', 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return apiError('common.unauthorized', 401);

    const limited = await enforceRateLimit(req, 'store-daily', 10, 60, userId);
    if (limited) return limited;

    const result = await claimDailyReward(userId);
    // Not claimable (e.g. already claimed): still a 200 as before, with the message in the player's language
    if (!result.success) {
      return NextResponse.json({ ...result, error: await errorMessage(result.error), code: result.error, achievementsUnlocked: [] });
    }
    // The claim's XP can level the player up (Veteran achievement)
    const achievementsUnlocked = await syncAchievementsSafe(userId);
    return NextResponse.json({ ...result, achievementsUnlocked });

  } catch (error) {
    console.error('Daily reward error:', error);
    return apiError('store.dailyClaimFailed', 500);
  }
}
