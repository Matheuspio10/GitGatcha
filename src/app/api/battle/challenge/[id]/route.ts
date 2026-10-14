import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveFriendBattle } from '@/lib/battleService';
import { advanceMissionProgress } from '@/lib/economyService';
import { syncAchievementsSafe } from '@/lib/achievementService';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCardType } from '@/lib/battleResolver';
import { getCardStamina } from '@/lib/staminaService';
import { cancelChallenge, expireChallenges, joinChallenge, releaseDefender, takenByAnother } from '@/lib/challengeService';
import { teamCardIdsSchema } from '@/lib/playerTeam';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const bodySchema = z.object({ cardIds: teamCardIdsSchema });

// POST: Defender responds to a challenge with their 3-card team
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const { id: battleId } = await params;
    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { cardIds } = body.data;

    // The battle must still be waiting; an expired one is closed (stake refunded)
    const battle = await prisma.battle.findUnique({ where: { id: battleId } });
    if (!battle) return apiError('challenge.battleNotFound', 404);
    // Someone else got to an open challenge first (a race on the link), whatever its status now
    if (takenByAnother(battle, userId)) return apiError('challenge.alreadyAccepted', 409);
    if (battle.status !== 'PENDING') return apiError('challenge.noLongerPending');
    if (battle.expiresAt && battle.expiresAt < new Date()) {
      await expireChallenges();
      return apiError('challenge.expired');
    }
    if (battle.defenderId !== userId && !(battle.isOpen && !battle.defenderId)) {
      return apiError('challenge.notDefender', 403);
    }

    // Verify defender owns all 3 cards
    const uniqueCardIds = Array.from(new Set(cardIds));
    const userCards = await prisma.userCard.findMany({
      where: { userId, cardId: { in: uniqueCardIds } },
      include: { card: true },
    });

    const requiredCounts: Record<string, number> = {};
    for (const id of cardIds) {
      requiredCounts[id] = (requiredCounts[id] || 0) + 1;
    }

    const ownedCounts: Record<string, number> = {};
    for (const uc of userCards) {
      ownedCounts[uc.cardId] = (ownedCounts[uc.cardId] || 0) + 1;
    }

    for (const [id, count] of Object.entries(requiredCounts)) {
      if (!ownedCounts[id] || ownedCounts[id] < count) {
        return apiError('team.cardsNotOwned', 404);
      }
    }

    const orderedCards = cardIds.map(id => userCards.find(uc => uc.cardId === id));
    if (orderedCards.some(uc => !uc)) return apiError('team.buildFailed', 500);

    // Same exhaustion rule as battles against the computer, on the recovered value
    for (const uc of orderedCards) {
      if (getCardStamina(uc!) === 0) {
        return apiError('team.cardExhausted', 400, { name: uc!.card.name });
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
    return routeError(error, 'challenge.respondFailed', 'Challenge response error');
  }
}

// DELETE: the challenger withdraws a pending challenge (stake refunded)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const { id } = await params;
  try {
    await cancelChallenge(id, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return routeError(err, 'challenge.cancelFailed', 'Challenge cancel error');
  }
}
