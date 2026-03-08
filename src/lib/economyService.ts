import { prisma } from './prisma';

const POSSIBLE_MISSIONS = [
  { description: "Open 3 Boosters", type: "OPEN_BOOSTER", reward: 300, targetValue: "3" },
  { description: "Win 2 Battles", type: "WIN_BATTLE", reward: 200, targetValue: "2" },
  { description: "Collect a Rare Card", type: "COLLECT_RARITY", reward: 100, targetValue: "Rare" },
  { description: "Get a Python Dev", type: "COLLECT_LANGUAGE", reward: 150, targetValue: "Python" },
  { description: "Get a HTML Dev", type: "COLLECT_LANGUAGE", reward: 150, targetValue: "HTML" },
];

export async function getUserMissions(userId: string) {
  let m = await prisma.userMission.findMany({
    where: { userId },
    include: { mission: true }
  });

  if (m.length === 0) {
    const picked = POSSIBLE_MISSIONS.sort(() => 0.5 - Math.random()).slice(0, 3);
    for (const p of picked) {
      let mission = await prisma.mission.findFirst({
        where: { description: p.description }
      });
      if (!mission) {
        mission = await prisma.mission.create({ data: p });
      }
      await prisma.userMission.create({
        data: { userId, missionId: mission.id }
      });
    }
    m = await prisma.userMission.findMany({
      where: { userId },
      include: { mission: true }
    });
  }
  return m;
}

export async function advanceMissionProgress(userId: string, type: string, targetValue?: string) {
  const activeMissions = await prisma.userMission.findMany({
    where: {
      userId,
      completed: false,
      mission: { type }
    },
    include: { mission: true }
  });

  for (const um of activeMissions) {
    if (um.mission.targetValue && targetValue && um.mission.targetValue !== targetValue) {
      continue; // e.g. looking for "Python" but we opened "JavaScript"
    }

    const newProgress = um.progress + 1;
    // Assuming target value is integer if type is "OPEN_BOOSTER", etc.. We will hack:
    let isComplete = false;
    let required = parseInt(um.mission.targetValue || "1", 10);
    if (isNaN(required)) required = 1; // if string like "Rare", required is just 1 occurrence.

    if (newProgress >= required) {
      isComplete = true;
    }

    await prisma.userMission.update({
      where: { id: um.id },
      data: {
        progress: newProgress,
        completed: isComplete
      }
    });

    if (isComplete) {
      // Grant reward
      await prisma.user.update({
        where: { id: userId },
        data: { currency: { increment: um.mission.reward } }
      });
    }
  }
}

export async function grantCurrency(userId: string, amount: number) {
  return prisma.user.update({
    where: { id: userId },
    data: { currency: { increment: amount } }
  });
}

const DAILY_REWARD_AMOUNT = 100;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function claimDailyReward(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastDailyClaimAt: true, currency: true }
  });

  if (!user) return { success: false, error: 'User not found' };

  const now = new Date();

  if (user.lastDailyClaimAt) {
    const timeSinceLast = now.getTime() - user.lastDailyClaimAt.getTime();
    if (timeSinceLast < DAILY_COOLDOWN_MS) {
      const nextClaimAt = new Date(user.lastDailyClaimAt.getTime() + DAILY_COOLDOWN_MS);
      return {
        success: false,
        error: 'Daily reward already claimed',
        nextClaimAt: nextClaimAt.toISOString(),
        remainingMs: DAILY_COOLDOWN_MS - timeSinceLast,
      };
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      currency: { increment: DAILY_REWARD_AMOUNT },
      lastDailyClaimAt: now,
    }
  });

  return {
    success: true,
    amount: DAILY_REWARD_AMOUNT,
    newCurrency: updated.currency,
    nextClaimAt: new Date(now.getTime() + DAILY_COOLDOWN_MS).toISOString(),
  };
}
