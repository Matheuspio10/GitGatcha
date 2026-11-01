import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { joinGroup, previewGroup } from '@/lib/leagueGroupService';

/** GET ?code=: what the code leads to (name, size, owner), before joining. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  // Codes are guessable one at a time only: keep the guessing slow
  const limited = await enforceRateLimit(req, 'league-group-code', 20, 60, userId);
  if (limited) return limited;

  const code = new URL(req.url).searchParams.get('code');
  if (!code) return apiError('leagueGroups.codeRequired');
  try {
    return NextResponse.json(await previewGroup(userId, code));
  } catch (err) {
    return routeError(err, 'leagueGroups.failed', 'League group preview error');
  }
}

const bodySchema = z.object({ code: z.string().trim().max(20).optional() }).optional();

/** POST { code }: joins the private league with that invite code. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'league-group-code', 20, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  if (!body.data?.code) return apiError('leagueGroups.codeRequired');

  try {
    const result = await joinGroup(userId, body.data.code);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'leagueGroups.failed', 'League group join error');
  }
}
