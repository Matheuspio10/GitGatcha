import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { idSchema } from '@/lib/validation';
import { giftOptions, sendGift } from '@/lib/giftService';

/** GET ?cardId=: the fee, what blocks the gift and which friends can get the card. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);

  const parsed = idSchema.safeParse(new URL(req.url).searchParams.get('cardId'));
  if (!parsed.success) return apiError('gifts.cardRequired');
  try {
    return NextResponse.json(await giftOptions(userId, parsed.data));
  } catch (err) {
    return routeError(err, 'gifts.loadFailed', 'Gift options error');
  }
}

const bodySchema = z.object({
  cardId: idSchema.optional(),
  toUsername: z.string().trim().min(1).max(100).optional(),
}).optional();

/** POST { cardId, toUsername }: gives the card to that friend (the sender pays the fee). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'card-gift', 10, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  if (!body.data?.cardId) return apiError('gifts.cardRequired');
  if (!body.data.toUsername) return apiError('gifts.friendRequired');

  try {
    const result = await sendGift(userId, body.data.cardId, body.data.toUsername);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'gifts.failed', 'Gift error');
  }
}
