import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { idSchema } from '@/lib/validation';
import { saveLineup } from '@/lib/leagueService';

const bodySchema = z.object({
  cardIds: z.array(idSchema).max(10).optional(),
  captainId: idSchema.optional(),
}).optional();

/** POST { cardIds, captainId }: the player's lineup for the next round (editable until it starts). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'league-lineup', 30, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  if (!body.data?.cardIds || !body.data.captainId) return apiError('league.lineupRequired');

  try {
    const result = await saveLineup(userId, body.data.cardIds, body.data.captainId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'league.saveFailed', 'League lineup error');
  }
}
