import { prisma } from './prisma';
import { resolve3v3Battle, BattleCard, getCardType } from './battleResolver';

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

export function calculateRewards(
  didWin: boolean,
  isRandom: boolean,
  winnerAvgRank: number,
  loserAvgRank: number
): { bits: number; xp: number } {
  let bits: number;
  let xp: number;

  if (didWin) {
    bits = isRandom ? 50 : 75;
    xp = 20;

    // Upset bonus: winner team has lower avg rarity than loser team
    if (winnerAvgRank < loserAvgRank) {
      bits = Math.floor(bits * 1.3); // 30% bonus
      xp = Math.floor(xp * 1.3);
    }
  } else {
    bits = isRandom ? 10 : 15;
    xp = 5;
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

// Resolve a full random battle
export async function resolveRandomBattle(
  challengerId: string,
  challengerTeamCards: any[]
) {
  // Map challenger info
  const cTeam: BattleCard[] = challengerTeamCards.map(c => ({
    id: c.id,
    name: c.name,
    atk: c.atk,
    def: c.def,
    hp: c.hp,
    maxHp: c.hp,
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
    true,
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
      xp: { increment: rewards.xp },
      rating: {
          // Increase/decrease rating against a "reference" 1000 rating sys
          set: Math.max(0, calculateNewRatings(
              playerWon ? 1000 : 1000, 
              playerWon ? 1000 : 1000
          ).newWinnerRating) // For random battle it's a bit simple, let's just do a +5 / -5 for simplicity or use the elo
      }
    },
  });
  
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

  return {
    battle,
    defenderTeam: dTeam,
    winnerSide: battleResult.winner,
    rewards,
    log: battleResult.log
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
    maxHp: c.hp,
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
    challengerWon, false,
    challengerWon ? challengerAvgRank : defenderAvgRank,
    challengerWon ? defenderAvgRank : challengerAvgRank
  );
  
  const defenderRewards = calculateRewards(
    !challengerWon, false,
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
      xp: { increment: challengerRewards.xp },
    },
  });

  if (battle.defenderId) {
    await prisma.user.update({
      where: { id: battle.defenderId },
      data: {
        currency: { increment: defenderRewards.bits },
        xp: { increment: defenderRewards.xp },
      },
    });

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

  return {
    battle: updatedBattle,
    winnerSide: battleResult.winner,
    challengerRewards,
    defenderRewards,
    log: battleResult.log,
  };
}
