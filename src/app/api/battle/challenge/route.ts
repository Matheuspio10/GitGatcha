import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST: Create a friend challenge
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { defenderUsername, cardId, attribute } = await req.json();

    if (!['ATK', 'DEF', 'HP'].includes(attribute)) {
      return NextResponse.json({ error: 'Invalid attribute. Must be ATK, DEF, or HP.' }, { status: 400 });
    }

    // Look up defender by username
    const defender = await prisma.user.findUnique({
      where: { username: defenderUsername },
    });

    if (!defender) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (defender.id === userId) return NextResponse.json({ error: 'You cannot challenge yourself' }, { status: 400 });

    // Verify card ownership
    const userCard = await prisma.userCard.findFirst({
      where: { userId, cardId },
      include: { card: true }
    });
    if (!userCard) return NextResponse.json({ error: 'Card not found in your collection' }, { status: 404 });

    // Create the battle with PENDING status and round 1 attribute pre-set
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const battle = await prisma.battle.create({
      data: {
        challengerId: userId,
        defenderId: defender.id,
        challengerCardId: cardId,
        status: 'PENDING',
        isRandom: false,
        expiresAt,
        rounds: {
          create: {
            roundNum: 1,
            attribute,
            challengerValue: 0, // Will be filled on resolution
            defenderValue: 0,
          }
        }
      },
      include: {
        challenger: { select: { id: true, username: true, image: true } },
        challengerCard: true,
        rounds: true,
      }
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
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: {
        status: 'EXPIRED',
        winnerId: undefined, // Will be set to challenger below
      }
    });

    // Auto-win expired challenges for challenger
    const expiredBattles = await prisma.battle.findMany({
      where: {
        status: 'EXPIRED',
        winnerId: null,
      }
    });

    for (const b of expiredBattles) {
      await prisma.battle.update({
        where: { id: b.id },
        data: { winnerId: b.challengerId, completedAt: new Date() }
      });
    }

    // Fetch incoming challenges (where user is defender)
    const incoming = await prisma.battle.findMany({
      where: {
        defenderId: userId,
        status: 'PENDING',
      },
      include: {
        challenger: { select: { id: true, username: true, image: true } },
        challengerCard: { select: { id: true, name: true, rarity: true } },
        rounds: { orderBy: { roundNum: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch outgoing challenges (where user is challenger)
    const outgoing = await prisma.battle.findMany({
      where: {
        challengerId: userId,
        status: 'PENDING',
      },
      include: {
        defender: { select: { id: true, username: true, image: true } },
        rounds: { orderBy: { roundNum: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ incoming, outgoing });

  } catch (error) {
    console.error('Challenge fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 });
  }
}
