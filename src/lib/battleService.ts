import { prisma } from './prisma';

type BattleCard = {
  id: string;
  name: string;
  atk: number;
  def: number;
  hp: number;
  rarity: string;
};

type Attribute = 'ATK' | 'DEF' | 'HP';

const ATTRIBUTES: Attribute[] = ['ATK', 'DEF', 'HP'];

const RARITY_ORDER: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
};

function getCardAttributeValue(card: BattleCard, attribute: Attribute): number {
  switch (attribute) {
    case 'ATK': return card.atk;
    case 'DEF': return card.def;
    case 'HP': return card.hp;
  }
}

function resolveRound(
  challengerCard: BattleCard,
  defenderCard: BattleCard,
  attribute: Attribute
): { challengerValue: number; defenderValue: number; winner: 'CHALLENGER' | 'DEFENDER' | 'DRAW' } {
  const cVal = getCardAttributeValue(challengerCard, attribute);
  const dVal = getCardAttributeValue(defenderCard, attribute);

  let winner: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
  if (cVal > dVal) winner = 'CHALLENGER';
  else if (dVal > cVal) winner = 'DEFENDER';
  else winner = 'DRAW';

  return { challengerValue: cVal, defenderValue: dVal, winner };
}

function pickRandomAttribute(exclude?: Attribute[]): Attribute {
  const available = exclude ? ATTRIBUTES.filter(a => !exclude.includes(a)) : ATTRIBUTES;
  return available[Math.floor(Math.random() * available.length)];
}

// Calculate rewards based on win/loss, friend vs random, and rarity upset
export function calculateRewards(
  didWin: boolean,
  isRandom: boolean,
  winnerCardRarity?: string,
  loserCardRarity?: string
): { bits: number; xp: number } {
  let bits: number;
  let xp: number;

  if (didWin) {
    bits = isRandom ? 50 : 75;
    xp = 20;

    // Upset bonus: winner card is lower rarity than loser card
    if (winnerCardRarity && loserCardRarity) {
      const winnerRank = RARITY_ORDER[winnerCardRarity] || 1;
      const loserRank = RARITY_ORDER[loserCardRarity] || 1;
      if (winnerRank < loserRank) {
        bits = Math.floor(bits * 1.5);
        xp = Math.floor(xp * 1.5);
      }
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

// Resolve a full random battle (all 3 rounds, auto-picked attributes)
export async function resolveRandomBattle(
  challengerId: string,
  challengerCard: BattleCard
) {
  // Pick a random opponent card from the DB
  const allCardsCount = await prisma.card.count();
  if (allCardsCount === 0) throw new Error('No cards available for battle');

  const skip = Math.floor(Math.random() * allCardsCount);
  const defenderCard = await prisma.card.findFirst({ skip });
  if (!defenderCard) throw new Error('Failed to find opponent card');

  // Pick 3 unique attributes for each round
  const round1Attr = pickRandomAttribute();
  const round2Attr = pickRandomAttribute([round1Attr]);
  const remaining = ATTRIBUTES.filter(a => a !== round1Attr && a !== round2Attr);
  const round3Attr = remaining[0]; // Only one left

  const defCard: BattleCard = {
    id: defenderCard.id,
    name: defenderCard.name,
    atk: defenderCard.atk,
    def: defenderCard.def,
    hp: defenderCard.hp,
    rarity: defenderCard.rarity,
  };

  const r1 = resolveRound(challengerCard, defCard, round1Attr);
  const r2 = resolveRound(challengerCard, defCard, round2Attr);

  let challengerWins = 0;
  let defenderWins = 0;
  if (r1.winner === 'CHALLENGER') challengerWins++;
  else if (r1.winner === 'DEFENDER') defenderWins++;
  if (r2.winner === 'CHALLENGER') challengerWins++;
  else if (r2.winner === 'DEFENDER') defenderWins++;

  // Determine if round 3 is needed
  let r3: ReturnType<typeof resolveRound> | null = null;
  const needsRound3 = challengerWins < 2 && defenderWins < 2;

  if (needsRound3) {
    r3 = resolveRound(challengerCard, defCard, round3Attr);
    if (r3.winner === 'CHALLENGER') challengerWins++;
    else if (r3.winner === 'DEFENDER') defenderWins++;
  }

  // Final winner determination
  let winnerSide: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
  if (challengerWins > defenderWins) winnerSide = 'CHALLENGER';
  else if (defenderWins > challengerWins) winnerSide = 'DEFENDER';
  else winnerSide = 'DRAW'; // edge case: all 3 rounds draw

  const playerWon = winnerSide === 'CHALLENGER';
  const rewards = calculateRewards(
    playerWon,
    true,
    playerWon ? challengerCard.rarity : defCard.rarity,
    playerWon ? defCard.rarity : challengerCard.rarity
  );

  // Create battle record
  const rounds: { roundNum: number; attribute: string; challengerValue: number; defenderValue: number; winnerId: string | null }[] = [
    {
      roundNum: 1,
      attribute: round1Attr,
      challengerValue: r1.challengerValue,
      defenderValue: r1.defenderValue,
      winnerId: r1.winner === 'CHALLENGER' ? challengerId : r1.winner === 'DEFENDER' ? '__SYSTEM__' : null,
    },
    {
      roundNum: 2,
      attribute: round2Attr,
      challengerValue: r2.challengerValue,
      defenderValue: r2.defenderValue,
      winnerId: r2.winner === 'CHALLENGER' ? challengerId : r2.winner === 'DEFENDER' ? '__SYSTEM__' : null,
    },
  ];

  if (r3) {
    rounds.push({
      roundNum: 3,
      attribute: round3Attr,
      challengerValue: r3.challengerValue,
      defenderValue: r3.defenderValue,
      winnerId: r3.winner === 'CHALLENGER' ? challengerId : r3.winner === 'DEFENDER' ? '__SYSTEM__' : null,
    });
  }

  const battle = await prisma.battle.create({
    data: {
      challengerId,
      defenderId: null,
      challengerCardId: challengerCard.id,
      defenderCardId: defCard.id,
      status: 'COMPLETED',
      isRandom: true,
      winnerId: playerWon ? challengerId : '__SYSTEM__',
      rewardBits: rewards.bits,
      completedAt: new Date(),
      rounds: {
        create: rounds,
      },
    },
    include: { rounds: { orderBy: { roundNum: 'asc' } } },
  });

  // Grant rewards
  await prisma.user.update({
    where: { id: challengerId },
    data: {
      currency: { increment: rewards.bits },
      xp: { increment: rewards.xp },
    },
  });

  return {
    battle,
    defenderCard: defCard,
    winnerSide,
    rewards,
    rounds: rounds.map((r, i) => ({
      roundNum: r.roundNum,
      attribute: r.attribute,
      challengerValue: r.challengerValue,
      defenderValue: r.defenderValue,
      winner: [r1, r2, r3][i]!.winner,
    })),
  };
}

// Resolve a friend challenge
export async function resolveFriendBattle(
  battleId: string,
  defenderCardId: string,
  defenderRound2Attribute: Attribute
) {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      rounds: { orderBy: { roundNum: 'asc' } },
      challengerCard: true,
      challenger: true,
      defender: true,
    },
  });

  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'PENDING') throw new Error('Battle is not pending');

  const defenderCard = await prisma.card.findUnique({ where: { id: defenderCardId } });
  if (!defenderCard) throw new Error('Defender card not found');

  const cCard: BattleCard = {
    id: battle.challengerCard.id,
    name: battle.challengerCard.name,
    atk: battle.challengerCard.atk,
    def: battle.challengerCard.def,
    hp: battle.challengerCard.hp,
    rarity: battle.challengerCard.rarity,
  };

  const dCard: BattleCard = {
    id: defenderCard.id,
    name: defenderCard.name,
    atk: defenderCard.atk,
    def: defenderCard.def,
    hp: defenderCard.hp,
    rarity: defenderCard.rarity,
  };

  // Round 1: attribute was already set by challenger
  const round1Attr = battle.rounds[0]?.attribute as Attribute;
  if (!round1Attr) throw new Error('Round 1 attribute not set');

  // Round 2: chosen by defender
  const round2Attr = defenderRound2Attribute;

  // Round 3: random from remaining (if not already used)
  const usedAttrs = [round1Attr, round2Attr];
  const round3Attr = pickRandomAttribute(usedAttrs as Attribute[]);

  const r1 = resolveRound(cCard, dCard, round1Attr);
  const r2 = resolveRound(cCard, dCard, round2Attr);

  let challengerWins = 0;
  let defenderWins = 0;
  if (r1.winner === 'CHALLENGER') challengerWins++;
  else if (r1.winner === 'DEFENDER') defenderWins++;
  if (r2.winner === 'CHALLENGER') challengerWins++;
  else if (r2.winner === 'DEFENDER') defenderWins++;

  let r3: ReturnType<typeof resolveRound> | null = null;
  const needsRound3 = challengerWins < 2 && defenderWins < 2;

  if (needsRound3) {
    r3 = resolveRound(cCard, dCard, round3Attr);
    if (r3.winner === 'CHALLENGER') challengerWins++;
    else if (r3.winner === 'DEFENDER') defenderWins++;
  }

  let winnerSide: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
  if (challengerWins > defenderWins) winnerSide = 'CHALLENGER';
  else if (defenderWins > challengerWins) winnerSide = 'DEFENDER';
  else winnerSide = 'DRAW';

  const winnerId = winnerSide === 'CHALLENGER' ? battle.challengerId :
                   winnerSide === 'DEFENDER' ? battle.defenderId :
                   null;

  // Calculate rewards for both players
  const challengerWon = winnerSide === 'CHALLENGER';
  const challengerRewards = calculateRewards(
    challengerWon, false,
    challengerWon ? cCard.rarity : dCard.rarity,
    challengerWon ? dCard.rarity : cCard.rarity
  );
  const defenderRewards = calculateRewards(
    !challengerWon && winnerSide !== 'DRAW', false,
    !challengerWon ? dCard.rarity : cCard.rarity,
    !challengerWon ? cCard.rarity : dCard.rarity
  );

  // Update round 1 with actual values, create rounds 2 and 3
  await prisma.battleRound.update({
    where: { id: battle.rounds[0].id },
    data: {
      challengerValue: r1.challengerValue,
      defenderValue: r1.defenderValue,
      winnerId: r1.winner === 'CHALLENGER' ? battle.challengerId :
                r1.winner === 'DEFENDER' ? battle.defenderId! : null,
    },
  });

  await prisma.battleRound.create({
    data: {
      battleId,
      roundNum: 2,
      attribute: round2Attr,
      challengerValue: r2.challengerValue,
      defenderValue: r2.defenderValue,
      winnerId: r2.winner === 'CHALLENGER' ? battle.challengerId :
                r2.winner === 'DEFENDER' ? battle.defenderId! : null,
    },
  });

  if (r3) {
    await prisma.battleRound.create({
      data: {
        battleId,
        roundNum: 3,
        attribute: round3Attr,
        challengerValue: r3.challengerValue,
        defenderValue: r3.defenderValue,
        winnerId: r3.winner === 'CHALLENGER' ? battle.challengerId :
                  r3.winner === 'DEFENDER' ? battle.defenderId! : null,
      },
    });
  }

  // Update battle status
  const updatedBattle = await prisma.battle.update({
    where: { id: battleId },
    data: {
      defenderCardId,
      status: 'COMPLETED',
      winnerId,
      rewardBits: challengerRewards.bits + defenderRewards.bits,
      completedAt: new Date(),
    },
    include: {
      rounds: { orderBy: { roundNum: 'asc' } },
      challengerCard: true,
      defenderCard: true,
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

    // Update ratings for both players (only for friend battles)
    if (winnerId) {
      const loserId = winnerId === battle.challengerId ? battle.defenderId : battle.challengerId;
      const winner = winnerId === battle.challengerId ? battle.challenger : battle.defender;
      const loser = loserId === battle.challengerId ? battle.challenger : battle.defender;

      if (winner && loser) {
        const { newWinnerRating, newLoserRating } = calculateNewRatings(winner.rating, loser.rating);
        await prisma.user.update({ where: { id: winnerId }, data: { rating: newWinnerRating } });
        await prisma.user.update({ where: { id: loserId }, data: { rating: newLoserRating } });
      }
    }
  }

  const allRounds = [
    { roundNum: 1, attribute: round1Attr, ...r1 },
    { roundNum: 2, attribute: round2Attr, ...r2 },
    ...(r3 ? [{ roundNum: 3, attribute: round3Attr, ...r3 }] : []),
  ];

  return {
    battle: updatedBattle,
    winnerSide,
    challengerRewards,
    defenderRewards,
    rounds: allRounds,
  };
}
