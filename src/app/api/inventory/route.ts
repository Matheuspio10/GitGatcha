import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getSerializablePacks } from '@/lib/packDefinitions';
import { InventoryItem } from '@/lib/xpService';
import { withUserLock, asArray } from '@/lib/userLock';

const LEGACY_ID_MAP: Record<string, string> = {
  'the-go-gophers': 'go-gophers',
  'c-plus-plus-ancients': 'cpp-ancients',
  'the-open-source-heroes': 'open-source-heroes',
  'the-solo-architects': 'solo-architects',
  'the-silent-giants': 'silent-giants',
  'the-maintainers': 'maintainers',
  'the-fossils': 'fossils'
};

function migrateLegacyPackIds(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.map(item => (LEGACY_ID_MAP[item.packId] ? { ...item, packId: LEGACY_ID_MAP[item.packId] } : item));
}

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

    let inventory = asArray<InventoryItem>(user.inventory);

    if (inventory.some(item => LEGACY_ID_MAP[item.packId])) {
      // Rewrite under the user lock, from a fresh read, so a parallel purchase/open isn't lost
      inventory = await withUserLock(userId, async (tx) => {
        const fresh = await tx.user.findUnique({ where: { id: userId }, select: { inventory: true } });
        const migrated = migrateLegacyPackIds(asArray<InventoryItem>(fresh?.inventory));
        await tx.user.update({
          where: { id: userId },
          data: { inventory: migrated as unknown as Prisma.InputJsonValue },
        });
        return migrated;
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
