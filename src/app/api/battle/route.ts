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
import { loadPlayerTeam } from '@/lib/playerTeam';
import { UserFacingError } from '@/lib/userLock';

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

    // Owned, not exhausted, in the chosen order (throws UserFacingError otherwise)
    const cTeamCards = await loadPlayerTeam(userId, cardIds);

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
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof NoOpponentError || error instanceof NoRankedOpponentError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Battle error:', error);
    return NextResponse.json({ error: 'Failed to initiate battle' }, { status: 500 });
  }
}
