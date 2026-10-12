import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { withUserLock } from '@/lib/userLock';
import { authOptions } from '@/lib/auth';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // The user has actively claimed the rewards from the UI modal.
    // They are already in their inventory/wallet due to xpService logic,
    // so we just clear the pending display queue (locked: grantXP may be adding to it).
    const found = await withUserLock(userId, async (tx) => {
      const dbUser = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!dbUser) return false;
      await tx.user.update({ where: { id: userId }, data: { pendingRewards: [] } });
      return true;
    });

    if (!found) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ success: true, message: 'Rewards claimed' });

  } catch (error) {
    console.error('Error claiming rewards:', error);
    return NextResponse.json({ error: 'Failed to claim rewards' }, { status: 500 });
  }
}
