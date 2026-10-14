import { after, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock, asArray } from '@/lib/userLock';
import { openBoosterPack, refillBoosterReserve, EmptyPackError } from '@/lib/boosterService';
import { advanceMissionProgress } from '@/lib/economyService';
import { grantXP, InventoryItem, XP_AMOUNTS } from '@/lib/xpService';
import { syncAchievementsSafe } from '@/lib/achievementService';
import { apiError, readBody } from '@/lib/apiResponse';
import { packIdSchema } from '@/lib/validation';
import { z } from 'zod';

const bodySchema = z.object({ packId: packIdSchema.optional() }).optional();

// Covers the opening plus the reserve refill that runs after the response
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const packId = body.data?.packId;
    if (!packId) return apiError('store.packRequired');

    // 1. Atomically take one pack of this type out of the inventory
    const takenPack = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { inventory: true } });
      if (!user) return null;
      const inventory = asArray<InventoryItem>(user.inventory);
      const packIndex = inventory.findIndex(item => item.packId === packId);
      if (packIndex === -1) return null;
      const [item] = inventory.splice(packIndex, 1);
      await tx.user.update({ select: { id: true }, where: { id: userId }, data: { inventory: inventory as unknown as Prisma.InputJsonValue } });
      return item;
    });

    if (!takenPack) {
      return apiError('inventory.packNotInInventory', 404);
    }

    // 2. Draw the cards (talks to GitHub, so it runs outside the lock). Give the pack back if it fails.
    let opened;
    try {
      opened = await openBoosterPack(userId, packId);
    } catch (err) {
      await withUserLock(userId, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { inventory: true } });
        await tx.user.update({
          select: { id: true },
          where: { id: userId },
          data: { inventory: [...asArray<InventoryItem>(user?.inventory), takenPack] as unknown as Prisma.InputJsonValue },
        });
      });
      throw err;
    }
    const { newCards, packDropFragments, pity } = opened;

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

    // New cards (and the XP) can reach achievement tiers; pays them once, never throws
    const achievementsUnlocked = await syncAchievementsSafe(userId);

    // Top the booster's reserve back up once the player already has their cards
    after(() => refillBoosterReserve(userId, packId));

    return NextResponse.json({
      success: true,
      cards: newCards,
      packDropFragments,
      xpGained: XP_AMOUNTS.OPEN_BOOSTER,
      xpResult,
      pity,
      achievementsUnlocked,
    });
  } catch (error) {
    console.error('Open pack error:', error);
    if (error instanceof EmptyPackError) {
      return apiError('inventory.emptyPack', 503);
    }
    return apiError('inventory.openFailed', 500);
  }
}
