import { prisma } from './prisma';
import { randomInt } from 'node:crypto';
import { withUserLock, Tx } from './userLock';
import { grantXP, XP_AMOUNTS } from './xpService';
import {
  DAILY_MISSION_COUNT,
  MISSION_POOL,
  missionMatchesEvent,
  missionRequiredCount,
  needsNewMissions,
  pickDailyMissions,
} from './missionUtils';

export { nextMissionReset } from './missionUtils';

const userMissionInclude = { mission: true } as const;

/**
 * Makes sure the player holds today's missions (UTC day), replacing a previous
 * day's set with DAILY_MISSION_COUNT new random ones. Must run under the user lock
 * so two parallel calls can't both assign a set.
 */
async function ensureDailyMissions(tx: Tx, userId: string, now = new Date()) {
  const current = await tx.userMission.findMany({ where: { userId }, include: userMissionInclude });
  if (!needsNewMissions(current.map(um => um.createdAt), now)) return current;

  const picked = pickDailyMissions(MISSION_POOL, DAILY_MISSION_COUNT, n => randomInt(0, n));

  // Mission rows are shared templates, matched by their full definition
  const existing = await tx.mission.findMany({ where: { description: { in: picked.map(p => p.description) } } });
  const missionIds: string[] = [];
  for (const def of picked) {
    const match = existing.find(m =>
      m.description === def.description && m.type === def.type &&
      m.targetValue === def.targetValue && m.reward === def.reward,
    );
    missionIds.push(match ? match.id : (await tx.mission.create({ data: def })).id);
  }

  await tx.userMission.deleteMany({ where: { userId } });
  await tx.userMission.createMany({
    data: missionIds.map(missionId => ({ userId, missionId, createdAt: now })),
  });

  return tx.userMission.findMany({ where: { userId }, include: userMissionInclude });
}

/** Today's missions of the player, each with the `required` count to complete it. */
export async function getUserMissions(userId: string) {
  const now = new Date();
  let missions = await prisma.userMission.findMany({ where: { userId }, include: userMissionInclude });

  // Only take the lock when a new set is needed (first visit of the day)
  if (needsNewMissions(missions.map(um => um.createdAt), now)) {
    missions = await withUserLock(userId, tx => ensureDailyMissions(tx, userId, now));
  }

  return missions.map(um => ({
    ...um,
    required: missionRequiredCount(um.mission.type, um.mission.targetValue),
  }));
}

export async function advanceMissionProgress(userId: string, type: string, targetValue?: string) {
  // Locked so two parallel progress events can't both complete (and pay) the same mission.
  return withUserLock(userId, async (tx) => {
    // Progress always goes to today's missions, even if the player hasn't opened the store yet
    const missions = await ensureDailyMissions(tx, userId);
    const activeMissions = missions.filter(um => !um.completed && um.mission.type === type);

    let totalCurrencyGained = 0;
    let totalXPGained = 0;

    for (const um of activeMissions) {
      // e.g. looking for "Python" but we opened "JavaScript", or a Common for "Collect a Rare"
      if (!missionMatchesEvent(um.mission.type, um.mission.targetValue, targetValue)) continue;

      const required = missionRequiredCount(um.mission.type, um.mission.targetValue);
      const newProgress = Math.min(um.progress + 1, required);
      const isComplete = newProgress >= required;

      await tx.userMission.update({
        where: { id: um.id },
        data: {
          progress: newProgress,
          completed: isComplete
        }
      });

      if (isComplete) {
        totalCurrencyGained += um.mission.reward;
        totalXPGained += XP_AMOUNTS.COMPLETE_DAILY_CHALLENGE;
      }
    }

    if (totalXPGained > 0 || totalCurrencyGained > 0) {
      await grantXP(userId, totalXPGained, totalCurrencyGained, tx);
    }
  });
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
  return withUserLock(userId, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { lastDailyClaimAt: true }
    });

    if (!user) return { success: false as const, error: 'User not found' };

    const now = new Date();

    if (user.lastDailyClaimAt) {
      const timeSinceLast = now.getTime() - user.lastDailyClaimAt.getTime();
      if (timeSinceLast < DAILY_COOLDOWN_MS) {
        const nextClaimAt = new Date(user.lastDailyClaimAt.getTime() + DAILY_COOLDOWN_MS);
        return {
          success: false as const,
          error: 'Daily reward already claimed',
          nextClaimAt: nextClaimAt.toISOString(),
          remainingMs: DAILY_COOLDOWN_MS - timeSinceLast,
        };
      }
    }

    const xpResult = await grantXP(userId, XP_AMOUNTS.LOGIN_STREAK, DAILY_REWARD_AMOUNT, tx);

    const updated = await tx.user.update({
      where: { id: userId },
      data: { lastDailyClaimAt: now },
      select: { currency: true },
    });

    return {
      success: true as const,
      amount: DAILY_REWARD_AMOUNT,
      newCurrency: updated.currency,
      xpResult,
      nextClaimAt: new Date(now.getTime() + DAILY_COOLDOWN_MS).toISOString(),
    };
  });
}
