import { prisma } from './prisma';
import { resolve3v3Battle, BattleCard, getCardType } from './battleResolver';
import { syncCardStamina } from './staminaService';

const RARITY_ORDER: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
};

// Calculate rewards based on win/loss, friend vs random, and rarity upset
// We use the AVERAGE rarity of the team now.
function getAverageRarityRank(team: BattleCard[]): number {
  if (team.length === 0) return 1;
  const sum = team.reduce((acc, card) => acc + (RARITY_ORDER[card.rarity] || 1), 0);
  return sum / team.length;
}

import { grantXP, XP_AMOUNTS } from './xpService';

export function calculateRewards(
  didWin: boolean,
  leagueMode: string,
  winnerAvgRank: number,
  loserAvgRank: number
): { bits: number; xp: number } {
  let bits: number;
  let xp: number;

  if (didWin) {
    switch (leagueMode) {
      case 'COMMON': bits = 80; xp = 100; break;
      case 'BALANCED': bits = 100; xp = 120; break;
      case 'DIVERSITY': bits = 120; xp = 140; break;
      case 'LEGENDARY': bits = 300; xp = 200; break;
      case 'OPEN':
      default: bits = 50; xp = 80; break;
    }
  } else {
    bits = 10;
    xp = 30; // 30 XP for loss regardless of league
  }

  return { bits, xp };
}

// Simple ELO rating update
export function calculateNewRatings(
  winnerRating: number,
  loserRating: number,
  K: number = 32
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerRating = Math.round(winnerRating + K * (1 - expectedWinner));
  const newLoserRating = Math.max(0, Math.round(loserRating + K * (0 - expectedLoser)));

  return { newWinnerRating, newLoserRating };
}

export async function resolveRandomBattle(
  challengerId: string,
  challengerTeamCards: any[],
  leagueMode: string = 'OPEN'
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
  }));

  const challengerAvgRank = getAverageRarityRank(cTeam);

  // Pick 3 random opponent cards from the DB, weighted somewhat by rarity (we can just fetch random from the pool for now, perhaps limiting top rarities if cTeam is weak, but for simplicity we fetch 3 random cards).
  const allCardsCount = await prisma.card.count();
  if (allCardsCount < 3) throw new Error('Not enough cards available for battle');

  // Fetch 3 random unique cards
  const randomSkip1 = Math.floor(Math.random() * (allCardsCount - 2));
  const dCardsRaw = await prisma.card.findMany({ skip: randomSkip1, take: 3 });
  
  // Sort them randomly
  const shuffledDCards = dCardsRaw.sort(() => 0.5 - Math.random());

  const dTeam: BattleCard[] = shuffledDCards.map(c => ({
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

  const defenderAvgRank = getAverageRarityRank(dTeam);

  // Run the battle!
  const battleResult = resolve3v3Battle(cTeam, dTeam);

  const playerWon = battleResult.winner === 'CHALLENGER';
  const rewards = calculateRewards(
    playerWon,
    leagueMode,
    playerWon ? challengerAvgRank : defenderAvgRank,
    playerWon ? defenderAvgRank : challengerAvgRank
  );

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
      battleStats: [
        ...battleResult.challengerTeamState,
        ...battleResult.defenderTeamState
      ].map(c => ({
        cardId: c.id,
        name: c.name,
        team: cTeam.some(ct => ct.id === c.id) ? 'CHALLENGER' : 'DEFENDER',
        damageDealt: c.statsDealtDamage || 0,
        damageReceived: c.statsTakenDamage || 0,
        passivesTriggered: c.statsPassivesTriggered || 0,
        critsLanded: c.statsCritsLanded || 0,
        momentumAchieved: !!c.statsMomentumAchieved
      })) as any,
      winnerId: playerWon ? challengerId : '__SYSTEM__',
      rewardBits: rewards.bits,
      completedAt: new Date(),
    }
  });

  // Grant rewards
  await prisma.user.update({
    where: { id: challengerId },
    data: {
      currency: { increment: rewards.bits },
      rating: {
          // Increase/decrease rating against a "reference" 1000 rating sys
          set: Math.max(0, calculateNewRatings(
              playerWon ? 1000 : 1000, 
              playerWon ? 1000 : 1000
          ).newWinnerRating) // For random battle it's a bit simple, let's just do a +5 / -5 for simplicity or use the elo
      }
    },
  });

  const xpResult = await grantXP(challengerId, rewards.xp);
  
  const userTemp = await prisma.user.findUnique({where: {id: challengerId}});
  if (userTemp) {
      const eloRes = calculateNewRatings(userTemp.rating, 1000);
      await prisma.user.update({
        where: { id: challengerId },
        data: {
          rating: playerWon ? eloRes.newWinnerRating : eloRes.newLoserRating
        }
    });
  }

  // Deduct 20 stamina from challenger cards
  const now = new Date();
  for (const c of cTeam) {
    await prisma.userCard.update({
      where: { id: c.id },
      data: {
        stamina: { decrement: 20 },
        lastUsedAt: now,
      }
    }); // c.id is userCardId as mapped in api route
  }

  const battleStats = [
    ...battleResult.challengerTeamState,
    ...battleResult.defenderTeamState
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

  return {
    battle,
    challengerTeam: cTeam,
    defenderTeam: dTeam,
    winnerSide: battleResult.winner,
    rewards,
    xpResult,
    log: battleResult.log,
    battleStats,
  };
}

// Resolve a friend challenge
export async function resolveFriendBattle(
  battleId: string,
  defenderTeamCards: any[]
) {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      challenger: true,
      defender: true,
    },
  });

  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'PENDING') throw new Error('Battle is not pending');

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
  }));
  const challengerAvgRank = getAverageRarityRank(cTeam);

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
  }));
  const defenderAvgRank = getAverageRarityRank(dTeam);

  // Run the battle!
  const battleResult = resolve3v3Battle(cTeam, dTeam);
  const challengerWon = battleResult.winner === 'CHALLENGER';

  const winnerId = challengerWon ? battle.challengerId : battle.defenderId;

  // Calculate rewards for both players
  const challengerRewards = calculateRewards(
    challengerWon, 'OPEN',
    challengerWon ? challengerAvgRank : defenderAvgRank,
    challengerWon ? defenderAvgRank : challengerAvgRank
  );
  
  const defenderRewards = calculateRewards(
    !challengerWon, 'OPEN',
    !challengerWon ? defenderAvgRank : challengerAvgRank,
    !challengerWon ? challengerAvgRank : defenderAvgRank
  );

  // Update battle status
  const updatedBattle = await prisma.battle.update({
    where: { id: battleId },
    data: {
      defenderTeam: dTeam as any,
      log: battleResult.log as any,
      status: 'COMPLETED',
      winnerId,
      rewardBits: challengerRewards.bits + defenderRewards.bits,
      battleStats: [
        ...battleResult.challengerTeamState,
        ...battleResult.defenderTeamState
      ].map((c: any) => ({
        cardId: c.id,
        name: c.name,
        team: cTeam.some((ct: any) => ct.id === c.id) ? 'CHALLENGER' : 'DEFENDER',
        damageDealt: c.statsDealtDamage || 0,
        damageReceived: c.statsTakenDamage || 0,
        passivesTriggered: c.statsPassivesTriggered || 0,
        critsLanded: c.statsCritsLanded || 0,
        momentumAchieved: !!c.statsMomentumAchieved
      })) as any,
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
    
    // We do not eagerly await defender XP to not block the challenger response,
    // in a real app this would be queued or handled correctly, but we'll await it here.
    await grantXP(battle.defenderId, defenderRewards.xp);

    // Update ratings for both players
    if (winnerId && battle.challenger && battle.defender) {
      const winner = winnerId === battle.challengerId ? battle.challenger : battle.defender;
      const loser = winnerId === battle.challengerId ? battle.defender : battle.challenger;

      if (winner && loser) {
        const { newWinnerRating, newLoserRating } = calculateNewRatings(winner.rating, loser.rating);
        await prisma.user.update({ where: { id: winner.id }, data: { rating: newWinnerRating } });
        await prisma.user.update({ where: { id: loser.id }, data: { rating: newLoserRating } });
      }
    }
  }

  // Deduct 20 stamina from all participating cards
  const now = new Date();
  for (const c of cTeam) {
    await prisma.userCard.update({
      where: { id: c.id },
      data: { stamina: { decrement: 20 }, lastUsedAt: now }
    });
  }
  for (const c of dTeam) {
    await prisma.userCard.update({
      where: { id: c.id },
      data: { stamina: { decrement: 20 }, lastUsedAt: now }
    });
  }

  return {
    battle: updatedBattle,
    winnerSide: battleResult.winner,
    challengerRewards,
    defenderRewards,
    xpResult: challengerXpResult,
    log: battleResult.log,
  };
}
