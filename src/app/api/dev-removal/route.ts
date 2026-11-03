import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { devRemovalStatus, removeDevForUser } from '@/lib/devRemovalService';

// GET: who the signed-in player is on GitHub, and their card (for /remove-my-card)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);
    // Each check asks GitHub who owns the token
    const limited = await enforceRateLimit(req, 'dev-removal', 20, 60, session.user.id);
    if (limited) return limited;
    return NextResponse.json(await devRemovalStatus(session.user.id));
  } catch (error) {
    return routeError(error, 'common.internal', 'Dev removal status error');
  }
}

const bodySchema = z.object({ confirm: z.literal(true).optional() }).optional();

// POST: the signed-in developer leaves the game (their own GitHub account only)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);
    const limited = await enforceRateLimit(req, 'dev-removal', 20, 60, session.user.id);
    if (limited) return limited;

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    if (!body.data?.confirm) return apiError('devRemoval.notConfirmed');

    const { login } = await removeDevForUser(session.user.id);
    return NextResponse.json({ success: true, login });
  } catch (error) {
    return routeError(error, 'common.internal', 'Dev removal error');
  }
}
