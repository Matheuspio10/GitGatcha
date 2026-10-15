import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { idSchema } from '@/lib/validation';
import { listTrades, proposeTrade } from '@/lib/tradeService';

/** GET: the player's open trades (both ways), the last finished ones and the limits. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  try {
    return NextResponse.json(await listTrades(userId));
  } catch (err) {
    return routeError(err, 'trades.loadFailed', 'Trades list error');
  }
}

const cardList = z.array(idSchema).max(10).optional();
const bodySchema = z.object({
  toUsername: z.string().trim().min(1).max(100).optional(),
  offered: cardList,
  requested: cardList,
}).optional();

/** POST { toUsername, offered, requested }: proposes the proposer's `offered` cards for the friend's `requested` ones. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'card-trade', 10, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  if (!body.data?.toUsername) return apiError('trades.friendRequired');

  try {
    const result = await proposeTrade(userId, body.data.toUsername, body.data.offered ?? [], body.data.requested ?? []);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'trades.failed', 'Trade proposal error');
  }
}
