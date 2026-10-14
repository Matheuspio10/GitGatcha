import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAchievementViews, syncAchievementsSafe } from '@/lib/achievementService';
import { apiError } from '@/lib/apiResponse';

/**
 * The viewer's achievements: first persists (and pays) any tier newly reached,
 * then returns every achievement with its tiers and progress.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const achievementsUnlocked = await syncAchievementsSafe(userId);
    const achievements = await getAchievementViews(userId);
    return NextResponse.json({ achievements, achievementsUnlocked });
  } catch (error) {
    console.error('Achievements error:', error);
    return apiError('achievements.loadFailed', 500);
  }
}
