import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRandomBattle } from '@/lib/battleService';
import { advanceMissionProgress } from '@/lib/economyService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardStamina } from '@/lib/staminaService';

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
    const uniqueCardIds = Array.from(new Set(cardIds));
    const userCards = await prisma.userCard.findMany({
      where: { 
          userId, 
          cardId: { in: uniqueCardIds } 
      },
      include: { card: true }
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

    // Map to preserve the chosen order
    // Validate stamina
    for (const id of cardIds as string[]) {
      const uc = userCards.find(u => u.cardId === id);
      if (uc) {
        const currentStamina = getCardStamina(uc);
        if (currentStamina === 0) {
          return NextResponse.json({ error: `Card ${uc.card.name} is exhausted and cannot battle` }, { status: 400 });
        }
      }
    }

    const cTeamCards = cardIds.map(id => {
      const uc = userCards.find(u => u.cardId === id)!;
      return {
        id: uc.id, // Pass userCardId as the 'id' so we can deduct stamina later
        cardId: uc.cardId,
        name: uc.card.name,
        atk: uc.card.atk,
        def: uc.card.def,
        hp: uc.card.hp,
        stamina: getCardStamina(uc),
        rarity: uc.card.rarity,
        primaryLanguage: uc.card.primaryLanguage,
        avatarUrl: uc.card.avatarUrl,
      };
    });

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
