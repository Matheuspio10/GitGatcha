import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { openBoosterPack } from '@/lib/boosterService';
import { prisma } from '@/lib/prisma';
import { advanceMissionProgress } from '@/lib/economyService';
import { getPackById } from '@/lib/packDefinitions';

const DEFAULT_BOOSTER_COST = 100;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse pack ID from request body
    let packId: string | undefined;
    try {
      const body = await req.json();
      packId = body.packId;
    } catch {
      // No body or invalid JSON — use default booster
    }

    // Determine cost from pack definition
    let cost = DEFAULT_BOOSTER_COST;
    if (packId) {
      const pack = getPackById(packId);
      if (!pack) {
        return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
      }
      cost = pack.cost;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }});
    if (!user || user.currency < cost) {
      return NextResponse.json({ error: 'Not enough Bits' }, { status: 400 });
    }

    // Deduct cost
    await prisma.user.update({
      where: { id: user.id },
      data: { currency: { decrement: cost } }
    });

    const cards = await openBoosterPack(user.id, packId);
    
    // Process missions async
    Promise.all([
      advanceMissionProgress(user.id, 'OPEN_BOOSTER'),
      ...cards.map(c => advanceMissionProgress(user.id, 'COLLECT_RARITY', c.rarity)),
      ...cards.map(c => advanceMissionProgress(user.id, 'COLLECT_LANGUAGE', c.primaryLanguage || 'Unknown'))
    ]).catch(console.error);

    return NextResponse.json({ success: true, cards, newCurrency: user.currency - cost });

  } catch (error) {
    console.error('Booster error:', error);
    return NextResponse.json({ error: 'Failed to open booster' }, { status: 500 });
  }
}
