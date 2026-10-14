import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPityStatus } from '@/lib/boosterService';
import { apiError } from '@/lib/apiResponse';

/** Legendary pity of the player: packs since the last Legendary and packs until one is guaranteed. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);
    return NextResponse.json(await getPityStatus(userId));
  } catch (error) {
    console.error('Pity status error:', error);
    return apiError('store.pityFailed', 500);
  }
}
