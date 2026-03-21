import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPackById, getSerializablePacks } from '@/lib/packDefinitions';
import { InventoryItem } from '@/lib/xpService';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { inventory: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let inventory: InventoryItem[] = Array.isArray(user.inventory)
      ? (user.inventory as unknown as InventoryItem[])
      : [];

    let needsUpdate = false;
    const LEGACY_ID_MAP: Record<string, string> = {
      'the-go-gophers': 'go-gophers',
      'c-plus-plus-ancients': 'cpp-ancients',
      'the-open-source-heroes': 'open-source-heroes',
      'the-solo-architects': 'solo-architects',
      'the-silent-giants': 'silent-giants',
      'the-maintainers': 'maintainers',
      'the-fossils': 'fossils'
    };

    inventory = inventory.map(item => {
      if (LEGACY_ID_MAP[item.packId]) {
        needsUpdate = true;
        return { ...item, packId: LEGACY_ID_MAP[item.packId] };
      }
      return item;
    });

    if (needsUpdate) {
      await prisma.user.update({
        where: { id: userId },
        data: { inventory: inventory as any },
      });
    }

    // Group packs by packId with count
    const packCounts: Record<string, { count: number; packId: string; packName: string; items: InventoryItem[] }> = {};
    for (const item of inventory) {
      if (!packCounts[item.packId]) {
        packCounts[item.packId] = { count: 0, packId: item.packId, packName: item.packName, items: [] };
      }
      packCounts[item.packId].count++;
      packCounts[item.packId].items.push(item);
    }

    // Enrich with pack visual data
    const allPacks = getSerializablePacks();
    const enrichedInventory = Object.values(packCounts).map(group => {
      const packDef = allPacks.find(p => p.id === group.packId);
      return {
        packId: group.packId,
        packName: group.packName,
        count: group.count,
        visualTheme: packDef?.visualTheme || null,
        cardCount: packDef?.cardCount || 5,
        guaranteedMinRarity: packDef?.guaranteedMinRarity || null,
        category: packDef?.category || 'unknown',
        description: packDef?.description || '',
        activeFilters: packDef?.activeFilters || '',
        allCommon: packDef?.allCommon || false,
        noPreview: packDef?.noPreview || false,
      };
    });

    return NextResponse.json({ inventory: enrichedInventory });
  } catch (error) {
    console.error('Inventory error:', error);
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
  }
}
