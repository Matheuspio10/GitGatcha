import { randomInt } from 'node:crypto';
import { addBits } from './bitsLedger';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { resolve3v3Battle, BattleCard, BattleResult, getCardType } from './battleResolver';
import { spendCardStamina } from './staminaService';
import { processPostBattleCardStats, MilestoneUnlock } from './loyaltyService';
import { grantXP } from './xpService';
import { asJson, lockUser, withUserLock, UserFacingError } from './userLock';
import { pushNotification } from './notifications';
import { closeDueSeasons, recordSeasonProgress } from './seasonService';
import { RANKED_SEARCH_WINDOWS } from './ranks';
import {
  BALANCED_POWER_CAP_MULTIPLIER,
  FRIEND_BATTLE_LEAGUE,
  LEAGUES,
  getLeagueRewards,
  isLeagueMode,
  RANKED_DEFENSE_WIN_BITS,
  RANKED_RECENT_OPPONENTS,
  upsetBonusPct,
  withUpsetBonus,
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

export interface RatingChange {
  winner: { before: number; after: number };
  loser: { before: number; after: number };
}

/** Applies a rated PvP result to both players, reading their current ratings under a lock. */
async function applyPvpRating(winnerId: string, loserId: string): Promise<RatingChange | null> {
  return prisma.$transaction(async (tx) => {
    // Always lock in the same order so two simultaneous results can't deadlock
    for (const id of [winnerId, loserId].sort()) await lockUser(tx, id);
    const players = await tx.user.findMany({ where: { id: { in: [winnerId, loserId] } }, select: { id: true, rating: true } });
    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);
    if (!winner || !loser) return null;
    const { newWinnerRating, newLoserRating } = calculateNewRatings(winner.rating, loser.rating);
    await tx.user.update({ select: { id: true }, where: { id: winnerId }, data: { rating: newWinnerRating } });
    await tx.user.update({ select: { id: true }, where: { id: loserId }, data: { rating: newLoserRating } });
    // Season: battles played, peak rating and first-time rank promotions
    await recordSeasonProgress(tx, winnerId, newWinnerRating);
    await recordSeasonProgress(tx, loserId, newLoserRating);
    return {
      winner: { before: winner.rating, after: newWinnerRating },
      loser: { before: loser.rating, after: newLoserRating },
    };
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
  challengerTeamCards: RankedTeamCard[],
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
    rarity: c.rarity as BattleCard['rarity'],
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
    loyaltyTier: c.loyaltyTier || 'none',
    trainingLevel: c.trainingLevel ?? 0,
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
    rarity: c.rarity as BattleCard['rarity'],
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
  }));

  // Run the battle!
  const battleResult = resolve3v3Battle(cTeam, dTeam);

  const playerWon = battleResult.winner === 'CHALLENGER';
  const rewards = withUpsetBonus(calculateRewards(playerWon, leagueMode), playerWon ? upsetBonusPct(cTeam, dTeam) : 0);
  const battleStats = buildBattleStats(battleResult, cTeam);

  // The battle record and its BITS are saved together: if this throws, nothing
  // happened and the caller can refund the entry fee. Battles against the
  // computer never change the rating (rating is a PvP-only ELO, see ratings.ts).
  const battle = await prisma.$transaction(async (tx) => {
    const created = await tx.battle.create({
      data: {
        challengerId,
        defenderId: null,
        challengerTeam: asJson(cTeam), // initial state
        defenderTeam: asJson(dTeam), // initial state
        log: asJson(battleResult.log), // the turn-by-turn history
        status: 'COMPLETED',
        isRandom: true,
        leagueMode,
        battleStats: asJson(battleStats),
        winnerId: playerWon ? challengerId : '__SYSTEM__',
        rewardBits: rewards.bits,
        completedAt: new Date(),
      }
    });
    await addBits(challengerId, rewards.bits, 'battle_reward', { tx, detail: `${LEAGUES[isLeagueMode(leagueMode) ? leagueMode : 'OPEN'].label}${playerWon ? ' win' : ' loss'}` });
    return created;
  });

  // From here on the battle exists and is paid: the follow-up steps are logged,
  // never thrown, so the player still sees the result (and keeps the fee spent).
  const afterBattle = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[Battle ${battle.id}] ${label} failed:`, (err as Error).message);
      return fallback;
    }
  };

  const xpResult = await afterBattle('XP', null, () => grantXP(challengerId, rewards.xp));

  // Spend stamina from the cards' current value (floor 0)
  await afterBattle('Stamina', undefined, () => spendCardStamina(challengerTeamCards.map(c => c.id)));

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

  const unlocksMap = await afterBattle('Loyalty', new Map<string, MilestoneUnlock[]>(), () => processPostBattleCardStats(cardsStatsToProcess));

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
      challenger: { select: { username: true } },
      defender: { select: { username: true } },
    },
  });
}

export async function resolveFriendBattle(
  battleId: string,
  defenderTeamCards: RankedTeamCard[]
) {
  await closeDueSeasons();
  const battle = await findBattleWithPlayers(battleId);

  if (!battle) throw new UserFacingError('challenge.battleNotFound', 404);
  if (battle.status !== 'PENDING') throw new UserFacingError('challenge.noLongerPending');

  // Claim the battle atomically: two parallel accepts must not both resolve it and pay rewards twice
  const claimed = await prisma.battle.updateMany({
    where: { id: battleId, status: 'PENDING' },
    data: { status: 'RESOLVING' },
  });
  if (claimed.count === 0) throw new UserFacingError('challenge.noLongerPending');

  try {
    return await finishFriendBattle(battle, defenderTeamCards);
  } catch (err) {
    await prisma.battle.updateMany({ where: { id: battleId, status: 'RESOLVING' }, data: { status: 'PENDING' } });
    throw err;
  }
}

async function finishFriendBattle(
  battle: NonNullable<Awaited<ReturnType<typeof findBattleWithPlayers>>>,
  defenderTeamCards: RankedTeamCard[],
) {
  const battleId = battle.id;

  const cTeamRaw = battle.challengerTeam as unknown as BattleCard[];
  const cTeam: BattleCard[] = cTeamRaw.map(c => ({
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
    trainingLevel: c.trainingLevel ?? 0,
  }));

  const dTeam: BattleCard[] = defenderTeamCards.map(c => ({
    id: c.id,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.hp,
    stamina: c.stamina ?? 100,
    rarity: c.rarity as BattleCard['rarity'],
    primaryLanguage: c.primaryLanguage,
    type: getCardType(c),
    avatarUrl: c.avatarUrl,
    loyaltyTier: c.loyaltyTier || 'none',
    trainingLevel: c.trainingLevel ?? 0,
  }));

  // Run the battle!
  const battleResult = resolve3v3Battle(cTeam, dTeam);
  const challengerWon = battleResult.winner === 'CHALLENGER';

  const winnerId = challengerWon ? battle.challengerId : battle.defenderId;

  // Rewards for both players (friend battles use a fixed league table); the winner
  // gets the upset bonus when their team was the weaker one
  const challengerRewards = withUpsetBonus(calculateRewards(challengerWon, FRIEND_BATTLE_LEAGUE), challengerWon ? upsetBonusPct(cTeam, dTeam) : 0);
  const defenderRewards = withUpsetBonus(calculateRewards(!challengerWon, FRIEND_BATTLE_LEAGUE), challengerWon ? 0 : upsetBonusPct(dTeam, cTeam));

  // Update battle status
  const updatedBattle = await prisma.battle.update({
    where: { id: battleId },
    data: {
      defenderTeam: asJson(dTeam),
      log: asJson(battleResult.log),
      status: 'COMPLETED',
      winnerId,
      rewardBits: challengerRewards.bits + defenderRewards.bits,
      battleStats: asJson(buildBattleStats(battleResult, cTeam)),
      completedAt: new Date(),
    },
  });

  // The winner takes both stakes (the battle is COMPLETED above, so this runs once)
  if (battle.stake > 0 && winnerId) {
    const loserName = (challengerWon ? battle.defender?.username : battle.challenger?.username) ?? 'a friend';
    await addBits(winnerId, battle.stake * 2, 'challenge_payout', { detail: `Stakes vs ${loserName}` });
  }

  // Grant rewards to both players
  await addBits(battle.challengerId, challengerRewards.bits, 'battle_reward', { detail: `Friend challenge ${challengerWon ? 'win' : 'loss'}` });
  const challengerXpResult = await grantXP(battle.challengerId, challengerRewards.xp);

  if (battle.defenderId) {
    await addBits(battle.defenderId, defenderRewards.bits, 'battle_reward', { detail: `Friend challenge ${challengerWon ? 'loss' : 'win'}` });

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
    ...cTeamRaw.map(c => c.id),
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


// ─── Ranked (ghost PvP) ──────────────────────────────────────────────────────

/** Thrown before anything is written when no player has a saved team to fight. */
export class NoRankedOpponentError extends Error {
  constructor() {
    super('No ranked opponent available right now. Try again later.');
  }
}

/**
 * A random player near `rating` whose saved active team has 3 cards, skipping
 * the challenger's last opponents when possible. The window widens (±100,
 * ±200, ±400, anyone) while nobody qualifies.
 */
async function findRankedOpponent(userId: string, rating: number): Promise<{ id: string; username: string | null } | null> {
  const recent = await prisma.battle.findMany({
    where: { challengerId: userId, leagueMode: 'RANKED', defenderId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: RANKED_RECENT_OPPONENTS,
    select: { defenderId: true },
  });
  const recentIds = recent.map(b => b.defenderId as string);

  for (const skipRecent of [true, false]) {
    const exclude = [userId, ...(skipRecent ? recentIds : [])];
    for (const window of RANKED_SEARCH_WINDOWS) {
      const near = Number.isFinite(window) ? Prisma.sql`ABS(u."rating" - ${rating}) <= ${window}` : Prisma.sql`TRUE`;
      const rows = await prisma.$queryRaw<{ id: string; username: string | null }[]>`
        SELECT u."id", u."username" FROM "User" u
        WHERE u."id" NOT IN (${Prisma.join(exclude)}) AND ${near} AND u."username" IS NOT NULL
          AND (SELECT COUNT(*) FROM "UserCard" uc WHERE uc."userId" = u."id" AND uc."in_active_team" = true) >= 3
        ORDER BY random()
        LIMIT 1
      `;
      if (rows[0]) return rows[0];
    }
  }
  return null;
}

type RankedCardData = { id: string; name: string; atk: number; def: number; hp: number; rarity: string; primaryLanguage: string | null; avatarUrl: string | null };

function toBattleCard(c: RankedCardData, stamina: number, loyaltyTier: string, trainingLevel = 0): BattleCard {
  return {
    id: c.id, name: c.name, atk: c.atk, def: c.def, hp: c.hp, maxHp: c.hp, stamina,
    rarity: c.rarity as BattleCard['rarity'], primaryLanguage: c.primaryLanguage, type: getCardType(c), avatarUrl: c.avatarUrl, loyaltyTier, trainingLevel,
  };
}

/**
 * Ranked battle: the challenger's team against the saved active team of a
 * player near their rating, who doesn't need to be online. Both ratings move
 * (ELO), the defender's cards don't spend stamina, and the defender is told the
 * result (plus a few BITS when their team holds).
 */
/** A challenger card as the battle route builds it (id = the UserCard id). */
export type RankedTeamCard = RankedCardData & { stamina?: number; loyaltyTier?: string; trainingLevel?: number };

export async function resolveRankedBattle(challengerId: string, challengerTeamCards: RankedTeamCard[]) {
  // A season that just ended is closed (and ratings reset) before the battle counts
  await closeDueSeasons();
  const challenger = await prisma.user.findUnique({ where: { id: challengerId }, select: { rating: true, username: true } });
  if (!challenger) throw new NoRankedOpponentError();
  const opponent = await findRankedOpponent(challengerId, challenger.rating);
  if (!opponent) throw new NoRankedOpponentError();

  const defenderCards = await prisma.userCard.findMany({
    where: { userId: opponent.id, inActiveTeam: true },
    include: { card: true },
    take: 3,
  });
  if (defenderCards.length < 3) throw new NoRankedOpponentError();

  const cTeam = challengerTeamCards.map(c => toBattleCard(c, c.stamina ?? 100, c.loyaltyTier || 'none', c.trainingLevel ?? 0));
  // The ghost team fights fresh: its owner isn't there to rest it
  const dTeam = defenderCards.map(uc => toBattleCard({ ...uc.card, id: uc.id }, 100, uc.loyaltyTier || 'none', uc.trainingLevel));

  const battleResult = resolve3v3Battle(cTeam, dTeam);
  const playerWon = battleResult.winner === 'CHALLENGER';
  const rewards = withUpsetBonus(calculateRewards(playerWon, 'RANKED'), playerWon ? upsetBonusPct(cTeam, dTeam) : 0);
  const battleStats = buildBattleStats(battleResult, cTeam);
  const who = challenger.username ?? 'A player';
  const against = opponent.username ?? 'a player';

  const battle = await prisma.$transaction(async (tx) => {
    const created = await tx.battle.create({
      data: {
        challengerId,
        defenderId: opponent.id,
        challengerTeam: asJson(cTeam),
        defenderTeam: asJson(dTeam),
        log: asJson(battleResult.log),
        status: 'COMPLETED',
        isRandom: false,
        leagueMode: 'RANKED',
        battleStats: asJson(battleStats),
        winnerId: playerWon ? challengerId : opponent.id,
        rewardBits: rewards.bits,
        completedAt: new Date(),
      },
    });
    await addBits(challengerId, rewards.bits, 'battle_reward', { tx, detail: `Ranked ${playerWon ? 'win' : 'loss'} vs ${against}` });
    return created;
  });

  const afterBattle = async <T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[Ranked ${battle.id}] ${label} failed:`, (err as Error).message);
      return fallback;
    }
  };

  const ratingChange = await afterBattle('Rating', null, () =>
    applyPvpRating(playerWon ? challengerId : opponent.id, playerWon ? opponent.id : challengerId));
  const xpResult = await afterBattle('XP', null, () => grantXP(challengerId, rewards.xp));
  await afterBattle('Stamina', undefined, () => spendCardStamina(challengerTeamCards.map(c => c.id)));
  const unlocksMap = await afterBattle('Loyalty', new Map<string, MilestoneUnlock[]>(), () => processPostBattleCardStats(cTeam.map(c => {
    const state = battleResult.challengerTeamState.find(cs => cs.id === c.id);
    return { userCardId: c.id, damageDealt: state?.statsDealtDamage || 0, won: playerWon, critsLanded: state?.statsCritsLanded || 0, passivesTriggered: state?.statsPassivesTriggered || 0 };
  })));

  // Tell the defender how their saved team did (and pay the defense)
  await afterBattle('Defender', undefined, () => withUserLock(opponent.id, async (tx) => {
    const mine = ratingChange ? (playerWon ? ratingChange.loser : ratingChange.winner) : null;
    const delta = mine ? mine.after - mine.before : 0;
    const signed = `${delta >= 0 ? '+' : ''}${delta}`;
    if (!playerWon) await addBits(opponent.id, RANKED_DEFENSE_WIN_BITS, 'battle_reward', { tx, detail: `Ranked defense vs ${who}` });
    await pushNotification(tx, opponent.id, 'ranked_defense', playerWon
      ? `${who} beat your saved team in Ranked (${signed} rating).`
      : `Your saved team held against ${who} in Ranked (${signed} rating, +${RANKED_DEFENSE_WIN_BITS} BITS).`, '/battle');
  }));

  const rating = ratingChange ? (playerWon ? ratingChange.winner : ratingChange.loser) : null;
  return {
    battle,
    challengerTeam: cTeam,
    defenderTeam: dTeam,
    winnerSide: battleResult.winner,
    rewards,
    xpResult,
    log: battleResult.log,
    battleStats,
    loyaltyUnlocks: cTeam
      .map(c => ({ cardId: c.id, cardName: c.name, milestones: unlocksMap.get(c.id) ?? [] }))
      .filter(u => u.milestones.length > 0),
    opponent: opponent.username,
    rating,
  };
}
