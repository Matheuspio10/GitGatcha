import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { respondTrade } from '@/lib/tradeService';

const bodySchema = z.object({ action: z.enum(['accept', 'decline', 'cancel']).optional() }).optional();

/** POST { action }: accept or decline (the receiver), or cancel (the proposer). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'card-trade-respond', 20, 60, userId);
  if (limited) return limited;

  const { id } = await params;
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  if (!body.data?.action) return apiError('trades.actionRequired');

  try {
    const result = await respondTrade(userId, id, body.data.action);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'trades.failed', 'Trade response error');
  }
}
