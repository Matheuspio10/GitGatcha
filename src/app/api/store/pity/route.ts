import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPityStatus } from '@/lib/boosterService';

/** Legendary pity of the player: packs since the last Legendary and packs until one is guaranteed. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await getPityStatus(userId));
  } catch (error) {
    console.error('Pity status error:', error);
    return NextResponse.json({ error: 'Failed to load pity status' }, { status: 500 });
  }
}
