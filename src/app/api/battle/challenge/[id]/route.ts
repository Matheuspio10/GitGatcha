import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveFriendBattle } from '@/lib/battleService';
import { advanceMissionProgress } from '@/lib/economyService';
import { syncAchievementsSafe } from '@/lib/achievementService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardType } from '@/lib/battleResolver';
import { getCardStamina } from '@/lib/staminaService';
import { UserFacingError } from '@/lib/userLock';
import { cancelChallenge, expireChallenges, joinChallenge, releaseDefender } from '@/lib/challengeService';

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

    // The battle must still be waiting; an expired one is closed (stake refunded)
    const battle = await prisma.battle.findUnique({ where: { id: battleId } });
    if (!battle) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    if (battle.status !== 'PENDING') return NextResponse.json({ error: 'Battle is no longer pending' }, { status: 400 });
    if (battle.expiresAt && battle.expiresAt < new Date()) {
      await expireChallenges();
      return NextResponse.json({ error: 'Challenge has expired' }, { status: 400 });
    }
    if (battle.defenderId !== userId && !(battle.isOpen && !battle.defenderId)) {
      return NextResponse.json({ error: 'You are not the defender of this battle' }, { status: 403 });
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

    const orderedCards = cardIds.map(id => userCards.find(uc => uc.cardId === id));
    if (orderedCards.some(uc => !uc)) return NextResponse.json({ error: 'Error building team' }, { status: 500 });

    // Same exhaustion rule as battles against the computer, on the recovered value
    for (const uc of orderedCards) {
      if (getCardStamina(uc!) === 0) {
        return NextResponse.json({ error: `Card ${uc!.card.name} is exhausted and cannot battle` }, { status: 400 });
      }
    }

    const dTeamCards = orderedCards.map(uc => {
      const c = uc!.card;
      return {
        id: uc!.id,
        cardId: c.id,
        name: c.name,
        avatarUrl: c.avatarUrl,
        atk: c.atk,
        def: c.def,
        hp: c.hp,
        maxHp: c.hp,
        stamina: getCardStamina(uc!), // current (recovered) stamina drives the fatigue penalty
        rarity: c.rarity,
        primaryLanguage: c.primaryLanguage,
        type: getCardType(c),
        loyaltyTier: uc!.loyaltyTier || 'none',
        trainingLevel: uc!.trainingLevel,
      };
    });

    // Join (claims an open challenge, matches the stake), then resolve. If the
    // battle can't be resolved, the defender's stake and claim are undone.
    const joined = await joinChallenge(battleId, userId);
    let result: Awaited<ReturnType<typeof resolveFriendBattle>>;
    try {
      result = await resolveFriendBattle(battleId, dTeamCards);
    } catch (err) {
      await releaseDefender(battleId, userId, joined);
      throw err;
    }

    // Advance missions for winner (the battle is already resolved: never fail the response here)
    try {
      if (result.winnerSide === 'CHALLENGER') {
        await advanceMissionProgress(battle.challengerId, 'WIN_BATTLE');
      } else if (result.winnerSide === 'DEFENDER' && battle.defenderId) {
        await advanceMissionProgress(battle.defenderId, 'WIN_BATTLE');
      }
    } catch (err) {
      console.error('Mission progress error:', err);
    }

    // Both players may reach achievement tiers; the defender (this request) gets the toasts,
    // the challenger's are paid now and shown on their profile. Never throws.
    const [achievementsUnlocked] = await Promise.all([
      syncAchievementsSafe(userId),
      syncAchievementsSafe(battle.challengerId),
    ]);

    return NextResponse.json({
      success: true,
      battleId: result.battle.id,
      winnerSide: result.winnerSide,
      winnerId: result.battle.winnerId,
      challengerRewards: result.challengerRewards,
      defenderRewards: result.defenderRewards,
      log: result.log,
      challengerTeam: result.challengerTeam,
      defenderTeam: result.defenderTeam,
      battleStats: result.battle.battleStats,
      loyaltyUnlocks: result.loyaltyUnlocks,
      achievementsUnlocked,
    });

  } catch (error) {
    if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Challenge response error:', error);
    return NextResponse.json({ error: 'Failed to respond to challenge: ' + (error as Error).message }, { status: 500 });
  }
}

// DELETE: the challenger withdraws a pending challenge (stake refunded)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await cancelChallenge(id, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Challenge cancel error:', err);
    return NextResponse.json({ error: 'Could not cancel the challenge' }, { status: 500 });
  }
}
