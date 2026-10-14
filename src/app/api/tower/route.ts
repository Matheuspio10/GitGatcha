import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { loadPlayerTeam, teamCardIdsSchema } from '@/lib/playerTeam';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';
import { fightTower, getTowerState } from '@/lib/towerService';
import { advanceMissionProgress } from '@/lib/economyService';
import { syncAchievementsSafe } from '@/lib/achievementService';

const bodySchema = z.object({ cardIds: teamCardIdsSchema });

/** This week's tower: theme, your progress, the next floor and the ranking. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  try {
    return NextResponse.json(await getTowerState(userId));
  } catch (err) {
    return routeError(err, 'tower.loadFailed', 'Tower state error');
  }
}

/** Fights the next floor with { cardIds }. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'battle-start', 20, 60, userId);
  if (limited) return limited;
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { cardIds } = body.data;
  try {
    const team = await loadPlayerTeam(userId, cardIds);
    const result = await fightTower(userId, team);
    if (result.winnerSide === 'CHALLENGER') {
      await advanceMissionProgress(userId, 'WIN_BATTLE').catch(err => console.error('Mission progress error:', err));
    }
    const achievementsUnlocked = await syncAchievementsSafe(userId);
    return NextResponse.json({ success: true, ...result, achievementsUnlocked });
  } catch (err) {
    return routeError(err, 'tower.fightFailed', 'Tower fight error');
  }
}
