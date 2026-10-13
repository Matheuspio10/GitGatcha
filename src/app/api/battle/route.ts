import { NextResponse } from 'next/server';
import { addBits, spendBits } from '@/lib/bitsLedger';
import { prisma } from '@/lib/prisma';
import { resolveRandomBattle, resolveRankedBattle, getBalancedPowerCap, NoOpponentError, NoRankedOpponentError } from '@/lib/battleService';
import { LEAGUES, isLeagueMode } from '@/lib/battleConfig';
import { advanceMissionProgress } from '@/lib/economyService';
import { syncAchievementsSafe } from '@/lib/achievementService';
import { getServerSession } from 'next-auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { authOptions } from '@/lib/auth';
import { getCardStamina } from '@/lib/staminaService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limited = await enforceRateLimit(req, 'battle-start', 20, 60, userId);
    if (limited) return limited;

    const { cardIds, leagueMode = 'OPEN' } = await req.json();
    if (!isLeagueMode(leagueMode)) {
        return NextResponse.json({ error: 'Unknown league' }, { status: 400 });
    }
    const league = LEAGUES[leagueMode];

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
        loyaltyTier: uc.loyaltyTier || 'none',
      };
    });

    const userObj = await prisma.user.findUnique({ where: { id: userId }, select: { currency: true }});
    if (!userObj) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // League Validations
    let powerCap: number | undefined;
    if (league.allowedRarities && cTeamCards.some(c => !league.allowedRarities!.includes(c.rarity))) {
      return NextResponse.json({ error: `This league only allows ${league.allowedRarities.join(' and ')} cards` }, { status: 400 });
    }
    if (leagueMode === 'BALANCED') {
      powerCap = await getBalancedPowerCap();
      const teamPower = cTeamCards.reduce((acc, c) => acc + c.atk + c.def + c.hp, 0);
      if (teamPower > powerCap) {
        return NextResponse.json({ error: `Team power (${teamPower}) exceeds Balanced League cap (${powerCap})` }, { status: 400 });
      }
    } else if (leagueMode === 'DIVERSITY') {
      const langs = new Set(cTeamCards.map(c => c.primaryLanguage).filter(l => l && l !== 'Unknown'));
      if (langs.size < 3) {
        return NextResponse.json({ error: 'Diversity League requires exactly 3 different primary languages and no empty languages' }, { status: 400 });
      }
    }

    const entryFee = league.entryFee;
    if (entryFee > 0) {
      if (userObj.currency < entryFee) {
        return NextResponse.json({ error: `Insufficient BITS for ${league.label} entry fee (${entryFee} required)` }, { status: 400 });
      }
      // Conditional spend: parallel requests can't push the balance below zero
      const charged = await spendBits(userId, entryFee, 'league_entry', { detail: league.label });
      if (charged === null) {
        return NextResponse.json({ error: `Insufficient BITS for ${league.label} entry fee (${entryFee} required)` }, { status: 400 });
      }
    }

    // Ranked: the opponent is another player's saved team, and the rating moves
    let ranked: { opponent: string | null; rating: { before: number; after: number } | null } | null = null;
    let result: Awaited<ReturnType<typeof resolveRandomBattle>>;
    try {
      if (leagueMode === 'RANKED') {
        const r = await resolveRankedBattle(userId, cTeamCards);
        ranked = { opponent: r.opponent, rating: r.rating };
        result = r;
      } else {
        result = await resolveRandomBattle(userId, cTeamCards, leagueMode, { powerCap });
      }
    } catch (err) {
      // resolveRandomBattle only throws before the battle is saved (no opponent,
      // database error…): the battle never happened, so the entry fee goes back
      if (entryFee > 0) {
        await addBits(userId, entryFee, 'league_refund', { detail: league.label });
      }
      throw err;
    }

    // Advance missions if won. The battle is already saved and paid: a mission
    // failure must not turn it into an error (the player would lose the replay).
    if (result.winnerSide === 'CHALLENGER') {
      try {
        await advanceMissionProgress(userId, 'WIN_BATTLE');
      } catch (err) {
        console.error('Mission progress error:', err);
      }
    }

    // Wins, XP (level) and loyalty can reach achievement tiers; never throws
    const achievementsUnlocked = await syncAchievementsSafe(userId);

    return NextResponse.json({
      success: true,
      battleId: result.battle.id,
      challengerTeam: result.challengerTeam,
      defenderTeam: result.defenderTeam,
      winnerSide: result.winnerSide,
      rewards: result.rewards,
      log: result.log,
      battleStats: result.battleStats || [],
      loyaltyUnlocks: result.loyaltyUnlocks || [],
      achievementsUnlocked,
      ranked,
    });

  } catch (error) {
    if (error instanceof NoOpponentError || error instanceof NoRankedOpponentError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Battle error:', error);
    return NextResponse.json({ error: 'Failed to initiate battle' }, { status: 500 });
  }
}
