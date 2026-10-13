import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserFacingError } from '@/lib/userLock';
import { enforceRateLimit } from '@/lib/rateLimit';
import { GitHubUnavailableError } from '@/lib/githubService';
import { checkDevMission } from '@/lib/economyService';

/** Checks today's dev mission against the player's public GitHub activity and pays it once. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // One GitHub call per check: a few per minute is plenty
  const limited = await enforceRateLimit(req, 'dev-mission-check', 6, 60, userId);
  if (limited) return limited;
  try {
    return NextResponse.json(await checkDevMission(userId));
  } catch (err) {
    if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof GitHubUnavailableError) return NextResponse.json({ error: 'GitHub is busy right now. Try again in a minute.' }, { status: 503 });
    console.error('Dev mission check error:', err);
    return NextResponse.json({ error: 'Could not check GitHub' }, { status: 500 });
  }
}
