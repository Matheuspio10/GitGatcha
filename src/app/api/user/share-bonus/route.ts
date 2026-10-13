import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SHARE_BONUS } from '@/lib/shareBonus';

/**
 * Pays SHARE_BONUS the first time the player shares a link (copy, X or the
 * phone's share sheet). Atomic: the flag and the BITS change together, once.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ granted: 0 });
  const { count } = await prisma.user.updateMany({
    where: { id: userId, shareBonusGranted: false },
    data: { shareBonusGranted: true, currency: { increment: SHARE_BONUS } },
  });
  return NextResponse.json({ granted: count === 1 ? SHARE_BONUS : 0 });
}
