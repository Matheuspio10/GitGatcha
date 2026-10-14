import { NextResponse } from 'next/server';
import { addBits, spendBits } from '@/lib/bitsLedger';
import { prisma } from '@/lib/prisma';
import { resolveRandomBattle, resolveRankedBattle, getBalancedPowerCap, NoOpponentError, NoRankedOpponentError } from '@/lib/battleService';
import { LEAGUES, isLeagueMode, type LeagueMode } from '@/lib/battleConfig';
import { advanceMissionProgress } from '@/lib/economyService';
import { syncAchievementsSafe } from '@/lib/achievementService';
import { getServerSession } from 'next-auth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { authOptions } from '@/lib/auth';
import { loadPlayerTeam, teamCardIdsSchema } from '@/lib/playerTeam';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { getGameText } from '@/i18n/gameText.server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

const bodySchema = z.object({
  cardIds: teamCardIdsSchema,
  leagueMode: z.string({ error: 'battle.unknownLeague' }).max(50, { error: 'battle.unknownLeague' }).optional(),
});

/** League name and a list of rarities in the player's language, for the error messages (English if there is no locale). */
async function leagueText(mode: LeagueMode) {
  try {
    const [game, locale] = await Promise.all([getGameText('gameBattle'), getLocale()]);
    const list = new Intl.ListFormat(locale, { type: 'conjunction' });
    return { label: game(`leagues.${mode}.label`, LEAGUES[mode].label), list: (items: readonly string[]) => list.format(items) };
  } catch {
    return { label: LEAGUES[mode].label, list: (items: readonly string[]) => items.join(' and ') };
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const limited = await enforceRateLimit(req, 'battle-start', 20, 60, userId);
    if (limited) return limited;

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { cardIds, leagueMode = 'OPEN' } = body.data;
    if (!isLeagueMode(leagueMode)) {
        return apiError('battle.unknownLeague');
    }
    const league = LEAGUES[leagueMode];

    // Owned, not exhausted, in the chosen order (throws UserFacingError otherwise)
    const cTeamCards = await loadPlayerTeam(userId, cardIds);

    const userObj = await prisma.user.findUnique({ where: { id: userId }, select: { currency: true }});
    if (!userObj) return apiError('common.userNotFound', 404);

    // League Validations
    let powerCap: number | undefined;
    if (league.allowedRarities && cTeamCards.some(c => !league.allowedRarities!.includes(c.rarity))) {
      const text = await leagueText(leagueMode);
      return apiError('battle.raritiesNotAllowed', 400, { rarities: text.list(league.allowedRarities) });
    }
    if (leagueMode === 'BALANCED') {
      powerCap = await getBalancedPowerCap();
      const teamPower = cTeamCards.reduce((acc, c) => acc + c.atk + c.def + c.hp, 0);
      if (teamPower > powerCap) {
        return apiError('battle.balancedCap', 400, { power: teamPower, cap: powerCap });
      }
    } else if (leagueMode === 'DIVERSITY') {
      const langs = new Set(cTeamCards.map(c => c.primaryLanguage).filter(l => l && l !== 'Unknown'));
      if (langs.size < 3) {
        return apiError('battle.diversityLanguages');
      }
    }

    const entryFee = league.entryFee;
    if (entryFee > 0) {
      if (userObj.currency < entryFee) {
        return apiError('battle.entryFee', 400, { league: (await leagueText(leagueMode)).label, fee: entryFee });
      }
      // Conditional spend: parallel requests can't push the balance below zero
      const charged = await spendBits(userId, entryFee, 'league_entry', { detail: league.label });
      if (charged === null) {
        return apiError('battle.entryFee', 400, { league: (await leagueText(leagueMode)).label, fee: entryFee });
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
    if (error instanceof NoOpponentError) return apiError('battle.noOpponent', 503);
    if (error instanceof NoRankedOpponentError) return apiError('battle.noRankedOpponent', 503);
    return routeError(error, 'battle.startFailed', 'Battle error');
  }
}
