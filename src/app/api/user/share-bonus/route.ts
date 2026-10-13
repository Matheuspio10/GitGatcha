import { NextResponse } from 'next/server';
import { addBits } from '@/lib/bitsLedger';
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
  const granted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, shareBonusGranted: false }, data: { shareBonusGranted: true } });
    if (count === 1) await addBits(userId, SHARE_BONUS, 'share_bonus', { tx });
    return count === 1 ? SHARE_BONUS : 0;
  });
  return NextResponse.json({ granted });
}
