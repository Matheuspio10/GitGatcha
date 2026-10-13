import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserFacingError } from '@/lib/userLock';
import { rerollDailyMission } from '@/lib/economyService';

/** Swaps one unfinished daily mission for another (once per UTC day). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userMissionId } = await req.json();
  if (typeof userMissionId !== 'string') return NextResponse.json({ error: 'userMissionId is required' }, { status: 400 });
  try {
    const mission = await rerollDailyMission(userId, userMissionId);
    return NextResponse.json({ success: true, mission });
  } catch (err) {
    if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Mission reroll error:', err);
    return NextResponse.json({ error: 'Could not swap the mission' }, { status: 500 });
  }
}
