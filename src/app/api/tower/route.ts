import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserFacingError } from '@/lib/userLock';
import { enforceRateLimit } from '@/lib/rateLimit';
import { loadPlayerTeam } from '@/lib/playerTeam';
import { fightTower, getTowerState } from '@/lib/towerService';
import { advanceMissionProgress } from '@/lib/economyService';
import { syncAchievementsSafe } from '@/lib/achievementService';

/** This week's tower: theme, your progress, the next floor and the ranking. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getTowerState(userId));
  } catch (err) {
    if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Tower state error:', err);
    return NextResponse.json({ error: 'Could not load the tower' }, { status: 500 });
  }
}

/** Fights the next floor with { cardIds }. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, 'battle-start', 20, 60, userId);
  if (limited) return limited;
  try {
    const { cardIds } = await req.json();
    const team = await loadPlayerTeam(userId, cardIds);
    const result = await fightTower(userId, team);
    if (result.winnerSide === 'CHALLENGER') {
      await advanceMissionProgress(userId, 'WIN_BATTLE').catch(err => console.error('Mission progress error:', err));
    }
    const achievementsUnlocked = await syncAchievementsSafe(userId);
    return NextResponse.json({ success: true, ...result, achievementsUnlocked });
  } catch (err) {
    if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Tower fight error:', err);
    return NextResponse.json({ error: 'The tower battle failed' }, { status: 500 });
  }
}
