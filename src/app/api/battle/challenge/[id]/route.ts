import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveFriendBattle } from '@/lib/battleService';
import { advanceMissionProgress } from '@/lib/economyService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardType } from '@/lib/battleResolver';

// POST: Defender responds to a challenge with their 3-card team
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: battleId } = await params;
    const { cardIds } = await req.json();

    if (!Array.isArray(cardIds) || cardIds.length !== 3) {
      return NextResponse.json({ error: 'You must select exactly 3 cards for your team' }, { status: 400 });
    }

    // Verify the battle exists and user is the defender
    const battle = await prisma.battle.findUnique({ where: { id: battleId } });
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

    // Verify defender owns all 3 cards
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

    const orderedCards = cardIds.map(id => userCards.find(uc => uc.cardId === id)?.card);
    if (orderedCards.some(c => !c)) return NextResponse.json({ error: 'Error building team' }, { status: 500 });

    const dTeamCards = orderedCards.map(c => ({
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

    // Resolve the full battle
    const result = await resolveFriendBattle(battleId, dTeamCards);

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
      log: result.log,
    });

  } catch (error) {
    console.error('Challenge response error:', error);
    return NextResponse.json({ error: 'Failed to respond to challenge' }, { status: 500 });
  }
}
