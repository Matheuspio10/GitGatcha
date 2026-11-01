import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { LEAGUE_GROUP_NAME_MAX, LEAGUE_GROUP_NAME_MIN, cleanGroupName } from '@/lib/league';
import { createGroup, listGroups } from '@/lib/leagueGroupService';

/** GET: the player's private leagues, every member's points (this round and overall) and the limits. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  try {
    return NextResponse.json(await listGroups(userId));
  } catch (err) {
    return routeError(err, 'leagueGroups.loadFailed', 'League groups list error');
  }
}

const bodySchema = z.object({ name: z.string().max(200).optional() }).optional();

/** POST { name }: creates a private league with the player in it; answers its invite code. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'league-group-create', 5, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const name = cleanGroupName(body.data?.name ?? '');
  if (name.length < LEAGUE_GROUP_NAME_MIN || name.length > LEAGUE_GROUP_NAME_MAX) {
    return apiError('leagueGroups.nameLength', 400, { min: LEAGUE_GROUP_NAME_MIN, max: LEAGUE_GROUP_NAME_MAX });
  }

  try {
    const result = await createGroup(userId, name);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'leagueGroups.failed', 'League group create error');
  }
}
