import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiError, routeError } from '@/lib/apiResponse';
import { getLeagueState } from '@/lib/leagueService';

/** GET: the next round's market, the player's lineups and the running round's top. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  try {
    return NextResponse.json(await getLeagueState(userId));
  } catch (err) {
    return routeError(err, 'league.loadFailed', 'League state error');
  }
}
