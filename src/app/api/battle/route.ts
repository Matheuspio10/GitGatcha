import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRandomBattle } from '@/lib/battleService';
import { advanceMissionProgress } from '@/lib/economyService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { cardIds } = await req.json();

    if (!Array.isArray(cardIds) || cardIds.length !== 3) {
        return NextResponse.json({ error: 'You must select exactly 3 cards for your team' }, { status: 400 });
    }

    // Verify ownership of all cards
    const userCards = await prisma.userCard.findMany({
      where: { 
          userId, 
          cardId: { in: cardIds } 
      },
      include: { card: true }
    });

    if (userCards.length !== new Set(cardIds).size) {
        return NextResponse.json({ error: 'One or more cards not found in your collection' }, { status: 404 });
    }

    // Map to preserve the chosen order
    const cTeamCardsRaw = cardIds.map(id => userCards.find(uc => uc.cardId === id)?.card);
    if (cTeamCardsRaw.some(c => !c)) return NextResponse.json({ error: 'Error building team' }, { status: 500 });

    const cTeamCards = cTeamCardsRaw.map(c => ({
      id: c!.id,
      name: c!.name,
      atk: c!.atk,
      def: c!.def,
      hp: c!.hp,
      rarity: c!.rarity,
      primaryLanguage: c!.primaryLanguage,
      avatarUrl: c!.avatarUrl,
    }));

    const result = await resolveRandomBattle(userId, cTeamCards);

    // Advance missions if won
    if (result.winnerSide === 'CHALLENGER') {
      await advanceMissionProgress(userId, 'WIN_BATTLE');
    }

    return NextResponse.json({
      success: true,
      battleId: result.battle.id,
      defenderTeam: result.defenderTeam,
      winnerSide: result.winnerSide,
      rewards: result.rewards,
      log: result.log,
    });

  } catch (error) {
    console.error('Battle error:', error);
    return NextResponse.json({ error: 'Failed to initiate battle' }, { status: 500 });
  }
}
