import { NextResponse } from 'next/server';
import { addBits } from '@/lib/bitsLedger';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock, asArray } from '@/lib/userLock';
import { getPackById } from '@/lib/packDefinitions';
import { InventoryItem } from '@/lib/xpService';
import { enforceRateLimit } from '@/lib/rateLimit';
import { activeEventPackId, isEventPackId } from '@/lib/weeklyEvents';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limited = await enforceRateLimit(req, 'store-booster', 20, 60, userId);
    if (limited) return limited;

    let packId: string | undefined;
    try {
      const body = await req.json();
      packId = body.packId;
    } catch {
      // No body or invalid JSON
    }

    if (!packId) {
      return NextResponse.json({ error: 'Pack ID required' }, { status: 400 });
    }

    const pack = getPackById(packId);
    if (!pack) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
    }
    // Event packs are only on sale during the week of their theme
    if (isEventPackId(pack.id) && pack.id !== activeEventPackId(new Date())) {
      return NextResponse.json({ error: 'This event pack is no longer on sale' }, { status: 410 });
    }

    const result = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { currency: true, inventory: true } });
      if (!user || user.currency < pack.cost) return null;

      const newItem: InventoryItem = {
        packId: pack.id,
        packName: pack.name,
        acquiredAt: new Date().toISOString(),
        source: 'purchase',
      };

      await tx.user.update({
        where: { id: userId },
        data: { inventory: [...asArray<InventoryItem>(user.inventory), newItem] as unknown as Prisma.InputJsonValue },
      });
      const currency = await addBits(userId, -pack.cost, 'pack_purchase', { tx, detail: pack.name });
      return { currency };
    });

    if (!result) {
      return NextResponse.json({ error: 'Not enough Bits' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      newCurrency: result.currency,
      packName: pack.name,
      packId: pack.id,
    });
  } catch (error) {
    console.error('Purchase error:', error);
    return NextResponse.json({ error: 'Failed to purchase pack' }, { status: 500 });
  }
}
