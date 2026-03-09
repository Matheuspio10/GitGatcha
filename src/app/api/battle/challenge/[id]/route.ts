import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveFriendBattle } from '@/lib/battleService';
import { advanceMissionProgress } from '@/lib/economyService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

type Attribute = 'ATK' | 'DEF' | 'HP';

// POST: Defender responds to a challenge
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: battleId } = await params;
    const { cardId, attribute } = await req.json();

    if (!['ATK', 'DEF', 'HP'].includes(attribute)) {
      return NextResponse.json({ error: 'Invalid attribute for round 2. Must be ATK, DEF, or HP.' }, { status: 400 });
    }

    // Verify the battle exists and user is the defender
    const battle = await prisma.battle.findUnique({
      where: { id: battleId },
    });

    if (!battle) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    if (battle.defenderId !== userId) return NextResponse.json({ error: 'You are not the defender of this battle' }, { status: 403 });
    if (battle.status !== 'PENDING') return NextResponse.json({ error: 'Battle is no longer pending' }, { status: 400 });

    // Check expiry
    if (battle.expiresAt && battle.expiresAt < new Date()) {
      await prisma.battle.update({
        where: { id: battleId },
        data: { status: 'EXPIRED', winnerId: battle.challengerId, completedAt: new Date() }
      });
      return NextResponse.json({ error: 'Challenge has expired' }, { status: 400 });
    }

    // Verify defender owns the card
    const defenderCard = await prisma.userCard.findFirst({
      where: { userId, cardId },
      include: { card: true }
    });
    if (!defenderCard) return NextResponse.json({ error: 'Card not found in your collection' }, { status: 404 });

    // Resolve the full battle
    const result = await resolveFriendBattle(battleId, cardId, attribute as Attribute);

    // Advance missions for winner
    if (result.winnerSide === 'CHALLENGER') {
      await advanceMissionProgress(battle.challengerId, 'WIN_BATTLE');
    } else if (result.winnerSide === 'DEFENDER' && battle.defenderId) {
      await advanceMissionProgress(battle.defenderId, 'WIN_BATTLE');
    }

    return NextResponse.json({
      success: true,
      battleId: result.battle.id,
      winnerSide: result.winnerSide,
      winnerId: result.battle.winnerId,
      challengerRewards: result.challengerRewards,
      defenderRewards: result.defenderRewards,
      rounds: result.rounds,
      battle: {
        challengerCard: result.battle.challengerCard,
        defenderCard: result.battle.defenderCard,
        challenger: result.battle.challenger,
        defender: result.battle.defender,
      }
    });

  } catch (error) {
    console.error('Challenge response error:', error);
    return NextResponse.json({ error: 'Failed to respond to challenge' }, { status: 500 });
  }
}
