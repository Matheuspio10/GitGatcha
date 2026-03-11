import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPackById } from '@/lib/packDefinitions';
import { InventoryItem } from '@/lib/xpService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.currency < pack.cost) {
      return NextResponse.json({ error: 'Not enough Bits' }, { status: 400 });
    }

    // Build new inventory item
    const newItem: InventoryItem = {
      packId: pack.id,
      packName: pack.name,
      acquiredAt: new Date().toISOString(),
      source: 'purchase',
    };

    const currentInventory: InventoryItem[] = Array.isArray(user.inventory)
      ? (user.inventory as unknown as InventoryItem[])
      : [];

    // Deduct cost and add pack to inventory
    await prisma.user.update({
      where: { id: userId },
      data: {
        currency: { decrement: pack.cost },
        inventory: [...currentInventory, newItem] as any,
      },
    });

    return NextResponse.json({
      success: true,
      newCurrency: user.currency - pack.cost,
      packName: pack.name,
      packId: pack.id,
    });
  } catch (error) {
    console.error('Purchase error:', error);
    return NextResponse.json({ error: 'Failed to purchase pack' }, { status: 500 });
  }
}
