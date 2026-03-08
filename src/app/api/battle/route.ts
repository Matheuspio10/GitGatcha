import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveBattle } from '@/lib/battleService';
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
      where: { userId: userId, cardId },
      include: { card: true }
    });

    if (!userCard) return NextResponse.json({ error: 'Card not found in your collection' }, { status: 404 });

    // Pick a random opponent from the database (PvE)
    // For a real game we might matchmake or have a dedicated AI roster.
    const allCardsCount = await prisma.card.count();
    const skip = Math.floor(Math.random() * allCardsCount);
    const opponentCard = await prisma.card.findFirst({ skip });

    if (!opponentCard) {
      return NextResponse.json({ error: 'No opponents available in the database yet. Open a booster first!' }, { status: 400 });
    }

    // Resolve Battle
    // The system opponent ID is just "SYSTEM"
    const result = await resolveBattle(userId, "SYSTEM", userCard.card, opponentCard);

    // If player won, grant rewards
    let rewardBits = 0;
    let rewardXp = 5;
    
    if (result.winnerSide === 'A') {
      // Assuming player is A since they are attacker
      rewardBits = 50;
      rewardXp = 20;

      await prisma.user.update({
        where: { id: userId },
        data: { 
          currency: { increment: rewardBits },
          xp: { increment: rewardXp }
        }
      });

      // Advance missions
      await advanceMissionProgress(userId, 'WIN_BATTLE');
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { xp: { increment: rewardXp } } // participation xp
      });
    }

    return NextResponse.json({ 
      success: true, 
      result, 
      opponentCard, 
      rewardBits, 
      rewardXp 
    });

  } catch (error) {
    console.error('Battle error:', error);
    return NextResponse.json({ error: 'Failed to initiate battle' }, { status: 500 });
  }
}
