import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReferralStats } from '@/lib/referralService';
import { apiError } from '@/lib/apiResponse';

/** The player's invite stats (the invite link is built on the client from their username). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  return NextResponse.json(await getReferralStats(userId));
}
