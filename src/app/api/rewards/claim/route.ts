import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { pendingRewards: true }
    });

    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // The user has actively claimed the rewards from the UI modal.
    // They are already in their inventory/wallet due to xpService logic,
    // so we just clear the pending display queue.
    await prisma.user.update({
      where: { id: userId },
      data: { pendingRewards: [] }
    });

    return NextResponse.json({ success: true, message: 'Rewards claimed' });

  } catch (error) {
    console.error('Error claiming rewards:', error);
    return NextResponse.json({ error: 'Failed to claim rewards' }, { status: 500 });
  }
}
