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

    const { cardId } = await req.json();

    // Verify ownership
    const userCard = await prisma.userCard.findFirst({
      where: { userId, cardId },
      include: { card: true }
    });

    if (!userCard) return NextResponse.json({ error: 'Card not found in your collection' }, { status: 404 });

    const result = await resolveRandomBattle(userId, {
      id: userCard.card.id,
      name: userCard.card.name,
      atk: userCard.card.atk,
      def: userCard.card.def,
      hp: userCard.card.hp,
      rarity: userCard.card.rarity,
    });

    // Advance missions if won
    if (result.winnerSide === 'CHALLENGER') {
      await advanceMissionProgress(userId, 'WIN_BATTLE');
    }

    return NextResponse.json({
      success: true,
      battleId: result.battle.id,
      defenderCard: result.defenderCard,
      winnerSide: result.winnerSide,
      rewards: result.rewards,
      rounds: result.rounds,
    });

  } catch (error) {
    console.error('Battle error:', error);
    return NextResponse.json({ error: 'Failed to initiate battle' }, { status: 500 });
  }
}
