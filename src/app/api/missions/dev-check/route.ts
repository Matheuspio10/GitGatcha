import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { GitHubUnavailableError } from '@/lib/githubService';
import { checkDevMission } from '@/lib/economyService';
import { apiError, routeError } from '@/lib/apiResponse';

/** Checks today's dev mission against the player's public GitHub activity and pays it once. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  // One GitHub call per check: a few per minute is plenty
  const limited = await enforceRateLimit(req, 'dev-mission-check', 6, 60, userId);
  if (limited) return limited;
  try {
    return NextResponse.json(await checkDevMission(userId));
  } catch (err) {
    if (err instanceof GitHubUnavailableError) return apiError('missions.githubBusy', 503);
    return routeError(err, 'missions.checkFailed', 'Dev mission check error');
  }
}
