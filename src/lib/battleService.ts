import { prisma } from './prisma';

type MiniCard = {
  id: string;
  name: string;
  atk: number;
  def: number;
  hp: number;
}

export async function resolveBattle(attackerId: string, defenderId: string, cardAttacker: MiniCard, cardDefender: MiniCard) {
  const log: string[] = [];
  let aHP = cardAttacker.hp;
  let dHP = cardDefender.hp;
  
  let currentAttacker = cardAttacker.atk >= cardDefender.atk ? 'A' : 'D';

  while (aHP > 0 && dHP > 0) {
    if (currentAttacker === 'A') {
      const dmg = Math.max(1, Math.floor(cardAttacker.atk - (cardDefender.def * 0.4)));
      dHP -= dmg;
      log.push(`${cardAttacker.name} attacked for ${dmg} damage. ${cardDefender.name} has ${dHP} HP left.`);
      currentAttacker = 'D';
    } else {
      const dmg = Math.max(1, Math.floor(cardDefender.atk - (cardAttacker.def * 0.4)));
      aHP -= dmg;
      log.push(`${cardDefender.name} attacked for ${dmg} damage. ${cardAttacker.name} has ${aHP} HP left.`);
      currentAttacker = 'A';
    }
  }
  
  const winnerSide = aHP > 0 ? 'A' : 'D';
  log.push(`${winnerSide === 'A' ? cardAttacker.name : cardDefender.name} wins!`);

  const winnerId = winnerSide === 'A' ? attackerId : defenderId;

  // Save history
  await prisma.battleHistory.create({
    data: {
      attackerId,
      defenderId,
      winnerId,
      log: JSON.stringify(log)
    }
  });

  return {
    winnerSide,
    winnerId,
    log,
    finalAttackerHp: aHP,
    finalDefenderHp: dHP
  };
}
