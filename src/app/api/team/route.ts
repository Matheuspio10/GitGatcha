import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardStamina } from '@/lib/staminaService';

/**
 * Handle GET to fetch which cards are currently marked as inActiveTeam.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const activeCards = await prisma.userCard.findMany({
      where: {
        userId,
        inActiveTeam: true
      },
      select: {
        id: true,
        cardId: true
      }
    });

    return NextResponse.json({ activeCards });
  } catch (error) {
    console.error('Fetch active team error:', error);
    return NextResponse.json({ error: 'Failed to fetch active team' }, { status: 500 });
  }
}

/**
 * Handle POST to update which cards are in active team.
 * This triggers a stamina sync and marks the rest as not in active team.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { cardIds } = await req.json(); // These are the global cardIds
    if (!Array.isArray(cardIds) || cardIds.length > 3) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // First fetch ALL user cards to properly sync them before toggling state
    const userCards = await prisma.userCard.findMany({
      where: { userId }
    });

    const now = new Date();

    const updates: any[] = [];
    
    // Update the whole collection by toggling inActiveTeam
    for (const uc of userCards) {
      const isNowActive = cardIds.includes(uc.cardId);
      
      if (uc.inActiveTeam !== isNowActive) {
        // Changing state -> we MUST calculate their current stamina and save it!
        // So that from this moment onward, the passive recovery resumes (if going inactive)
        // or pauses (if going active) at the correct current stamina value.
        const actualStamina = getCardStamina(uc);
        
        updates.push(prisma.userCard.update({
          where: { id: uc.id },
          data: {
            stamina: actualStamina,
            lastUsedAt: now,
            inActiveTeam: isNowActive
          }
        }));
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update active team error:', error);
    return NextResponse.json({ error: 'Failed to update active team' }, { status: 500 });
  }
}
