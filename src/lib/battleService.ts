import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { resolve3v3Battle, BattleCard, BattleResult, getCardType } from './battleResolver';
import { spendCardStamina } from './staminaService';
import { processPostBattleCardStats, MilestoneUnlock } from './loyaltyService';
import { grantXP } from './xpService';
import { lockUser } from './userLock';
import {
  BALANCED_POWER_CAP_MULTIPLIER,
  FRIEND_BATTLE_LEAGUE,
  LEAGUES,
  getLeagueRewards,
  isLeagueMode,
} from './battleConfig';
import { calculateNewRatings } from './ratings';
import { pickOpponentTeam, OpponentCandidate } from './opponentPicker';

export { calculateNewRatings };

const secureMathRandom = () => randomInt(0, 0xffffffff) / 0xffffffff;

/**
 * BITS and XP for one side of a battle. The amounts live in battleConfig
 * (LEAGUES) so the wiki and the team builder show the same numbers.
 */
export function calculateRewards(didWin: boolean, leagueMode: string): { bits: number; xp: number } {
  return getLeagueRewards(leagueMode, didWin);
}

/** Balanced League cap: average power (ATK + DEF + HP) of every card × BALANCED_POWER_CAP_MULTIPLIER. */
export async function getBalancedPowerCap(): Promise<number> {
  const agg = await prisma.card.aggregate({ _avg: { atk: true, def: true, hp: true } });
  const avgPower = (agg._avg.atk ?? 0) + (agg._avg.def ?? 0) + (agg._avg.hp ?? 0);
  return Math.floor(avgPower * BALANCED_POWER_CAP_MULTIPLIER);
}

// ─── Computer opponent ───────────────────────────────────────────────────────

/** Thrown before anything is written when no valid computer team exists for the league. */
export class NoOpponentError extends Error {
  constructor() {
    super('Not enough cards available for a battle in this league');
  }
}

type OpponentRow = OpponentCandidate & { name: string; avatarUrl: string | null };

const OPPONENT_SAMPLE_SIZE = 60;

/** A uniform random sample of cards that individually satisfy the league's rules. */
async function sampleOpponentCandidates(
  leagueMode: string,
  powerCap: number | undefined,
  excludeOwnedBy: string | null
): Promise<OpponentRow[]> {
  const league = LEAGUES[isLeagueMode(leagueMode) ? leagueMode : 'OPEN'];
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (league.allowedRarities) {
    conditions.push(Prisma.sql`c."rarity" IN (${Prisma.join([...league.allowedRarities])})`);
  }
  if (leagueMode === 'DIVERSITY') {
    conditions.push(Prisma.sql`c."primaryLanguage" IS NOT NULL AND c."primaryLanguage" NOT IN ('', 'Unknown')`);
  }
  if (leagueMode === 'BALANCED' && powerCap !== undefined) {
    conditions.push(Prisma.sql`(c."atk" + c."def" + c."hp") <= ${powerCap}`);
  }
  if (excludeOwnedBy) {
    conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "UserCard" uc WHERE uc."cardId" = c."id" AND uc."userId" = ${excludeOwnedBy})`);
  }
  return prisma.$queryRaw<OpponentRow[]>`
    SELECT c."id", c."name", c."atk", c."def", c."hp", c."rarity", c."primaryLanguage", c."avatarUrl"
    FROM "Card" c
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY random()
    LIMIT ${OPPONENT_SAMPLE_SIZE}
  `;
}

/**
 * The computer's team: 3 random cards that obey the same league restrictions
 * as the player's team. Cards the player owns are only used when there aren't
 * enough other cards to build a valid team.
 */
async function pickRandomOpponents(playerId: string, leagueMode: string, powerCap?: number): Promise<OpponentRow[]> {
  for (const exclude of [playerId, null]) {
    const sample = await sampleOpponentCandidates(leagueMode, powerCap, exclude);
    const team = pickOpponentTeam(sample, leagueMode, { powerCap, random: secureMathRandom });
    if (team) return team;
  }
  throw new NoOpponentError();
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Applies a rated PvP result to both players, reading their current ratings under a lock. */
async function applyPvpRating(winnerId: string, loserId: string) {
  await prisma.$transaction(async (tx) => {
    // Always lock in the same order so two simultaneous results can't deadlock
    for (const id of [winnerId, loserId].sort()) await lockUser(tx, id);
    const players = await tx.user.findMany({ where: { id: { in: [winnerId, loserId] } }, select: { id: true, rating: true } });
    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);
    if (!winner || !loser) return;
    const { newWinnerRating, newLoserRating } = calculateNewRatings(winner.rating, loser.rating);
    await tx.user.update({ where: { id: winnerId }, data: { rating: newWinnerRating } });
    await tx.user.update({ where: { id: loserId }, data: { rating: newLoserRating } });
  });
}

function buildBattleStats(battleResult: BattleResult, cTeam: BattleCard[]) {
  return [
    ...battleResult.challengerTeamState,
    ...battleResult.defenderTeamState,
  ].map(c => ({
    cardId: c.id,
    name: c.name,
    team: cTeam.some(ct => ct.id === c.id) ? 'CHALLENGER' : 'DEFENDER',
    damageDealt: c.statsDealtDamage || 0,
    damageReceived: c.statsTakenDamage || 0,
    passivesTriggered: c.statsPassivesTriggered || 0,
    critsLanded: c.statsCritsLanded || 0,
    momentumAchieved: !!c.statsMomentumAchieved,
  }));
}

// ─── PvE ─────────────────────────────────────────────────────────────────────

export async function resolveRandomBattle(
  challengerId: string,
  challengerTeamCards: any[],
  leagueMode: string = 'OPEN',
  options: { powerCap?: number } = {}
) {
  // Map challenger info
  const cTeam: BattleCard[] = challengerTeamCards.map(c => ({
    id: c.id,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.hp,
    stamina: c.stamina ?? 100,
    rarity: c.rarity as any,
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
    loyaltyTier: c.loyaltyTier || 'none',
  }));

  // The computer's team follows the same league rules as the player's
  const powerCap = leagueMode === 'BALANCED' ? (options.powerCap ?? await getBalancedPowerCap()) : undefined;
  const opponentCards = await pickRandomOpponents(challengerId, leagueMode, powerCap);

  const dTeam: BattleCard[] = opponentCards.map(c => ({
    id: c.id,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.hp,
    stamina: 100, // Random opponents start with 100 stamina
    rarity: c.rarity as any,
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
  }));

  // Run the battle!
  const battleResult = resolve3v3Battle(cTeam, dTeam);

  const playerWon = battleResult.winner === 'CHALLENGER';
  const rewards = calculateRewards(playerWon, leagueMode);
  const battleStats = buildBattleStats(battleResult, cTeam);

  // Create battle record
  const battle = await prisma.battle.create({
    data: {
      challengerId,
      defenderId: null,
      challengerTeam: cTeam as any, // initial state
      defenderTeam: dTeam as any, // initial state
      log: battleResult.log as any, // the turn-by-turn history
      status: 'COMPLETED',
      isRandom: true,
      leagueMode,
      battleStats: battleStats as any,
      winnerId: playerWon ? challengerId : '__SYSTEM__',
      rewardBits: rewards.bits,
      completedAt: new Date(),
    }
  });

  // Grant rewards. Battles against the computer never change the rating:
  // rating is a PvP-only ELO (see ratings.ts).
  if (rewards.bits > 0) {
    await prisma.user.update({
      where: { id: challengerId },
      data: { currency: { increment: rewards.bits } },
    });
  }

  const xpResult = await grantXP(challengerId, rewards.xp);

  // Spend stamina from the cards' current value (floor 0)
  await spendCardStamina(challengerTeamCards.map((c) => c.id as string));

  // --- Loyalty Processing for challenger cards ---
  const loyaltyUnlocks: { cardId: string; cardName: string; milestones: MilestoneUnlock[] }[] = [];

  const cardsStatsToProcess = cTeam.map(c => {
    const cardStats = battleResult.challengerTeamState.find(cs => cs.id === c.id);
    return {
      userCardId: c.id,
      damageDealt: cardStats?.statsDealtDamage || 0,
      won: playerWon,
      critsLanded: cardStats?.statsCritsLanded || 0,
      passivesTriggered: cardStats?.statsPassivesTriggered || 0,
    };
  });

  const unlocksMap = await processPostBattleCardStats(cardsStatsToProcess);

  for (const c of cTeam) {
    const unlocks = unlocksMap.get(c.id);
    if (unlocks && unlocks.length > 0) {
      loyaltyUnlocks.push({ cardId: c.id, cardName: c.name, milestones: unlocks });
    }
  }

  return {
    battle,
    challengerTeam: cTeam,
    defenderTeam: dTeam,
    winnerSide: battleResult.winner,
    rewards,
    xpResult,
    log: battleResult.log,
    battleStats,
    loyaltyUnlocks,
  };
}

// ─── PvP (friend challenge) ──────────────────────────────────────────────────

function findBattleWithPlayers(battleId: string) {
  return prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      challenger: true,
      defender: true,
    },
  });
}

export async function resolveFriendBattle(
  battleId: string,
  defenderTeamCards: any[]
) {
  const battle = await findBattleWithPlayers(battleId);

  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'PENDING') throw new Error('Battle is not pending');

  // Claim the battle atomically: two parallel accepts must not both resolve it and pay rewards twice
  const claimed = await prisma.battle.updateMany({
    where: { id: battleId, status: 'PENDING' },
    data: { status: 'RESOLVING' },
  });
  if (claimed.count === 0) throw new Error('Battle is not pending');

  try {
    return await finishFriendBattle(battle, defenderTeamCards);
  } catch (err) {
    await prisma.battle.updateMany({ where: { id: battleId, status: 'RESOLVING' }, data: { status: 'PENDING' } });
    throw err;
  }
}

async function finishFriendBattle(
  battle: NonNullable<Awaited<ReturnType<typeof findBattleWithPlayers>>>,
  defenderTeamCards: any[],
) {
  const battleId = battle.id;

  const cTeamRaw = battle.challengerTeam as any as BattleCard[];
  const cTeam: BattleCard[] = cTeamRaw.map((c: any) => ({
    id: c.id,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.maxHp || c.hp,
    stamina: c.stamina ?? 100,
    rarity: c.rarity,
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
    loyaltyTier: c.loyaltyTier || 'none',
  }));

  const dTeam: BattleCard[] = defenderTeamCards.map(c => ({
    id: c.id,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.hp,
    stamina: c.stamina ?? 100,
    rarity: c.rarity as any,
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
    loyaltyTier: c.loyaltyTier || 'none',
  }));

  // Run the battle!
  const battleResult = resolve3v3Battle(cTeam, dTeam);
  const challengerWon = battleResult.winner === 'CHALLENGER';

  const winnerId = challengerWon ? battle.challengerId : battle.defenderId;

  // Rewards for both players (friend battles use a fixed league table)
  const challengerRewards = calculateRewards(challengerWon, FRIEND_BATTLE_LEAGUE);
  const defenderRewards = calculateRewards(!challengerWon, FRIEND_BATTLE_LEAGUE);

  // Update battle status
  const updatedBattle = await prisma.battle.update({
    where: { id: battleId },
    data: {
      defenderTeam: dTeam as any,
      log: battleResult.log as any,
      status: 'COMPLETED',
      winnerId,
      rewardBits: challengerRewards.bits + defenderRewards.bits,
      battleStats: buildBattleStats(battleResult, cTeam) as any,
      completedAt: new Date(),
    },
    include: {
      challenger: true,
      defender: true,
    },
  });

  // Grant rewards to both players
  await prisma.user.update({
    where: { id: battle.challengerId },
    data: {
      currency: { increment: challengerRewards.bits },
    },
  });
  const challengerXpResult = await grantXP(battle.challengerId, challengerRewards.xp);

  if (battle.defenderId) {
    await prisma.user.update({
      where: { id: battle.defenderId },
      data: {
        currency: { increment: defenderRewards.bits },
      },
    });

    await grantXP(battle.defenderId, defenderRewards.xp);

    // Update ratings for both players (PvP is the only thing that moves rating)
    if (winnerId) {
      const loserId = winnerId === battle.challengerId ? battle.defenderId : battle.challengerId;
      await applyPvpRating(winnerId, loserId);
    }
  }

  // Spend 20 stamina from every participating card, starting from each card's
  // CURRENT stamina. The challenger snapshot can be up to 24h old: writing
  // "snapshot − 20" would restore stamina spent in other battles meanwhile.
  await spendCardStamina([
    ...cTeamRaw.map((c: any) => c.id as string),
    ...dTeam.map((c) => c.id),
  ]);

  // --- Loyalty Processing for ALL participating cards ---
  const loyaltyUnlocks: { cardId: string; cardName: string; milestones: MilestoneUnlock[] }[] = [];
  const allCardsWithTeam = [
    ...cTeam.map(c => ({ card: c, team: 'CHALLENGER' as const })),
    ...dTeam.map(c => ({ card: c, team: 'DEFENDER' as const })),
  ];

  const cardsStatsToProcess = allCardsWithTeam.map(({ card: c, team }) => {
    const cardState = team === 'CHALLENGER'
      ? battleResult.challengerTeamState.find(cs => cs.id === c.id)
      : battleResult.defenderTeamState.find(cs => cs.id === c.id);
    const didWin = (team === 'CHALLENGER' && challengerWon) || (team === 'DEFENDER' && !challengerWon);

    return {
      userCardId: c.id,
      damageDealt: cardState?.statsDealtDamage || 0,
      won: didWin,
      critsLanded: cardState?.statsCritsLanded || 0,
      passivesTriggered: cardState?.statsPassivesTriggered || 0,
    };
  });

  const unlocksMap = await processPostBattleCardStats(cardsStatsToProcess);

  for (const { card: c } of allCardsWithTeam) {
    const unlocks = unlocksMap.get(c.id);
    if (unlocks && unlocks.length > 0) {
      loyaltyUnlocks.push({ cardId: c.id, cardName: c.name, milestones: unlocks });
    }
  }

  return {
    battle: updatedBattle,
    winnerSide: battleResult.winner,
    challengerRewards,
    defenderRewards,
    xpResult: challengerXpResult,
    log: battleResult.log,
    challengerTeam: cTeam,
    defenderTeam: dTeam,
    loyaltyUnlocks,
  };
}
