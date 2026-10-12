import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock, asArray } from '@/lib/userLock';
import { openBoosterPack } from '@/lib/boosterService';
import { advanceMissionProgress } from '@/lib/economyService';
import { grantXP, InventoryItem, XP_AMOUNTS } from '@/lib/xpService';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { packId } = await req.json();
    if (!packId) return NextResponse.json({ error: 'Pack ID required' }, { status: 400 });

    // 1. Atomically take one pack of this type out of the inventory
    const takenPack = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { inventory: true } });
      if (!user) return null;
      const inventory = asArray<InventoryItem>(user.inventory);
      const packIndex = inventory.findIndex(item => item.packId === packId);
      if (packIndex === -1) return null;
      const [item] = inventory.splice(packIndex, 1);
      await tx.user.update({ where: { id: userId }, data: { inventory: inventory as unknown as Prisma.InputJsonValue } });
      return item;
    });

    if (!takenPack) {
      return NextResponse.json({ error: 'Pack not found in inventory' }, { status: 404 });
    }

    // 2. Draw the cards (talks to GitHub, so it runs outside the lock). Give the pack back if it fails.
    let opened;
    try {
      opened = await openBoosterPack(userId, packId);
    } catch (err) {
      await withUserLock(userId, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { inventory: true } });
        await tx.user.update({
          where: { id: userId },
          data: { inventory: [...asArray<InventoryItem>(user?.inventory), takenPack] as unknown as Prisma.InputJsonValue },
        });
      });
      throw err;
    }
    const { newCards, packDropFragments } = opened;

    // Grant XP for opening a booster
    const xpResult = await grantXP(userId, XP_AMOUNTS.OPEN_BOOSTER);

    // Missions are awaited: on serverless, work left running after the response can be killed
    try {
      await advanceMissionProgress(userId, 'OPEN_BOOSTER');
      for (const c of newCards) {
        await advanceMissionProgress(userId, 'COLLECT_RARITY', c.rarity);
        await advanceMissionProgress(userId, 'COLLECT_LANGUAGE', c.primaryLanguage || 'Unknown');
      }
    } catch (err) {
      console.error('Mission progress error:', err);
    }

    return NextResponse.json({
      success: true,
      cards: newCards,
      packDropFragments,
      xpGained: XP_AMOUNTS.OPEN_BOOSTER,
      xpResult,
    });
  } catch (error) {
    console.error('Open pack error:', error);
    return NextResponse.json({ error: 'Failed to open pack' }, { status: 500 });
  }
}
