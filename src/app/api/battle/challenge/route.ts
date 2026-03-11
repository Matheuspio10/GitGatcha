import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardType } from '@/lib/battleResolver';

// POST: Create a friend challenge (challenger picks their 3-card team)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { defenderUsername, cardIds } = await req.json();

    if (!Array.isArray(cardIds) || cardIds.length !== 3) {
      return NextResponse.json({ error: 'You must select exactly 3 cards for your team' }, { status: 400 });
    }

    // Look up defender by username
    const defender = await prisma.user.findUnique({ where: { username: defenderUsername } });
    if (!defender) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (defender.id === userId) return NextResponse.json({ error: 'You cannot challenge yourself' }, { status: 400 });

    // Verify card ownership and build team payload
    const uniqueCardIds = Array.from(new Set(cardIds));
    const userCards = await prisma.userCard.findMany({
      where: { userId, cardId: { in: uniqueCardIds } },
      include: { card: true },
    });

    const requiredCounts: Record<string, number> = {};
    for (const id of cardIds as string[]) {
      requiredCounts[id] = (requiredCounts[id] || 0) + 1;
    }

    const ownedCounts: Record<string, number> = {};
    for (const uc of userCards) {
      ownedCounts[uc.cardId] = (ownedCounts[uc.cardId] || 0) + 1;
    }

    for (const [id, count] of Object.entries(requiredCounts)) {
      if (!ownedCounts[id] || ownedCounts[id] < count) {
        return NextResponse.json({ error: 'One or more cards not found in your collection' }, { status: 404 });
      }
    }

    // Preserve chosen card order
    const orderedCards = cardIds.map(id => userCards.find(uc => uc.cardId === id)?.card);
    if (orderedCards.some(c => !c)) return NextResponse.json({ error: 'Error building team' }, { status: 500 });

    const challengerTeam = orderedCards.map(c => ({
      id: c!.id,
      name: c!.name,
      avatarUrl: c!.avatarUrl,
      atk: c!.atk,
      def: c!.def,
      hp: c!.hp,
      maxHp: c!.hp,
      rarity: c!.rarity,
      primaryLanguage: c!.primaryLanguage,
      type: getCardType(c!),
    }));

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const battle = await prisma.battle.create({
      data: {
        challengerId: userId,
        defenderId: defender.id,
        challengerTeam: challengerTeam as any,
        status: 'PENDING',
        isRandom: false,
        expiresAt,
      },
      include: {
        challenger: { select: { id: true, username: true, image: true } },
      },
    });

    return NextResponse.json({ success: true, battle });

  } catch (error) {
    console.error('Challenge creation error:', error);
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
  }
}

// GET: Get pending challenges for current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Expire old challenges
    await prisma.battle.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });

    // Fetch incoming challenges
    const incoming = await prisma.battle.findMany({
      where: { defenderId: userId, status: 'PENDING' },
      include: { challenger: { select: { id: true, username: true, image: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch outgoing challenges
    const outgoing = await prisma.battle.findMany({
      where: { challengerId: userId, status: 'PENDING' },
      include: { defender: { select: { id: true, username: true, image: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ incoming, outgoing });

  } catch (error) {
    console.error('Challenge fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 });
  }
}
