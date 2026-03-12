import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { openBoosterPack } from '@/lib/boosterService';
import { advanceMissionProgress } from '@/lib/economyService';
import { grantXP, InventoryItem, XP_AMOUNTS } from '@/lib/xpService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { packId } = await req.json();
    if (!packId) return NextResponse.json({ error: 'Pack ID required' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const inventory: InventoryItem[] = Array.isArray(user.inventory)
      ? (user.inventory as unknown as InventoryItem[])
      : [];

    // Find the first instance of this pack in inventory
    const packIndex = inventory.findIndex(item => item.packId === packId);
    if (packIndex === -1) {
      return NextResponse.json({ error: 'Pack not found in inventory' }, { status: 404 });
    }

    // Remove the pack from inventory
    const updatedInventory = [...inventory];
    updatedInventory.splice(packIndex, 1);

    await prisma.user.update({
      where: { id: userId },
      data: { inventory: updatedInventory as any },
    });

    // Open the booster pack
    const { newCards, packDropFragments } = await openBoosterPack(userId, packId);

    // Grant XP for opening a booster
    const xpResult = await grantXP(userId, XP_AMOUNTS.OPEN_BOOSTER);

    // Process missions async
    Promise.all([
      advanceMissionProgress(userId, 'OPEN_BOOSTER'),
      ...newCards.map(c => advanceMissionProgress(userId, 'COLLECT_RARITY', c.rarity)),
      ...newCards.map(c => advanceMissionProgress(userId, 'COLLECT_LANGUAGE', c.primaryLanguage || 'Unknown')),
    ]).catch(console.error);

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
