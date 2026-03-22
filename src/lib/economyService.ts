import { prisma } from './prisma';
import { randomInt } from 'node:crypto';

const POSSIBLE_MISSIONS = [
  { description: "Open 3 Boosters", type: "OPEN_BOOSTER", reward: 300, targetValue: "3" },
  { description: "Win 2 Battles", type: "WIN_BATTLE", reward: 200, targetValue: "2" },
  { description: "Collect a Rare Card", type: "COLLECT_RARITY", reward: 100, targetValue: "Rare" },
  { description: "Get a Python Dev", type: "COLLECT_LANGUAGE", reward: 150, targetValue: "Python" },
  { description: "Get a HTML Dev", type: "COLLECT_LANGUAGE", reward: 150, targetValue: "HTML" },
];

function shuffleMissions<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function getUserMissions(userId: string) {
  let m = await prisma.userMission.findMany({
    where: { userId },
    include: { mission: true }
  });

  if (m.length === 0) {
    const picked = shuffleMissions(POSSIBLE_MISSIONS).slice(0, 3);
    const pickedDescriptions = picked.map(p => p.description);

    const existingMissions = await prisma.mission.findMany({
      where: { description: { in: pickedDescriptions } }
    });

    const existingMissionsMap = new Map(existingMissions.map(m => [m.description, m]));
    const missingMissions = picked.filter(p => !existingMissionsMap.has(p.description));

    const newlyCreatedMissions = await Promise.all(
      missingMissions.map(p => prisma.mission.create({ data: p }))
    );

    const allMissions = [...existingMissions, ...newlyCreatedMissions];

    await prisma.userMission.createMany({
      data: allMissions.map(mission => ({
        userId,
        missionId: mission.id
      }))
    });

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

  const missionUpdates = [];
  let totalCurrencyGained = 0;
  let totalXPGained = 0;

  for (const um of activeMissions) {
    if (um.mission.targetValue && targetValue && um.mission.targetValue !== targetValue) {
      continue; // e.g. looking for "Python" but we opened "JavaScript"
    }

    const newProgress = um.progress + 1;
    let isComplete = false;
    let required = parseInt(um.mission.targetValue || "1", 10);
    if (isNaN(required)) required = 1;

    if (newProgress >= required) {
      isComplete = true;
    }

    missionUpdates.push(
      prisma.userMission.update({
        where: { id: um.id },
        data: {
          progress: newProgress,
          completed: isComplete
        }
      })
    );

    if (isComplete) {
      totalCurrencyGained += um.mission.reward;
      totalXPGained += XP_AMOUNTS.COMPLETE_DAILY_CHALLENGE;
    }
  }

  if (missionUpdates.length > 0) {
    await prisma.$transaction(missionUpdates);
  }

  if (totalXPGained > 0 || totalCurrencyGained > 0) {
    await grantXP(userId, totalXPGained, totalCurrencyGained);
  }
}

import { grantXP, XP_AMOUNTS } from './xpService';

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

  const xpResult = await grantXP(userId, XP_AMOUNTS.LOGIN_STREAK);

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
    xpResult,
    nextClaimAt: new Date(now.getTime() + DAILY_COOLDOWN_MS).toISOString(),
  };
}
