import { prisma } from './prisma';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { withUserLock, Tx, asArray, UserFacingError } from './userLock';
import { grantXP, InventoryItem, XP_AMOUNTS } from './xpService';
import { getPackById } from './packDefinitions';
import { DAILY_COOLDOWN_MS, loginCalendarState, nextStreakDay, rewardForDay } from './loginCalendar';
import {
  DAILY_MISSION_COUNT,
  DEV_MISSION_POOL,
  MISSION_POOL,
  WEEKLY_MISSION_COUNT,
  WEEKLY_MISSION_POOL,
  githubActivityDone,
  missionMatchesEvent,
  missionRequiredCount,
  needsNewSet,
  pickDailyMissions,
  utcDayStart,
  utcWeekStart,
  type MissionDefinition,
  type MissionPeriod,
} from './missionUtils';
import { fetchPublicEvents, getTokenOwnerLogin } from './githubService';

export { nextMissionReset, nextWeeklyReset } from './missionUtils';

const userMissionInclude = { mission: true } as const;

type PeriodConfig = { pool: readonly MissionDefinition[]; count: number; start: (now: Date) => Date };

/** Each mission period keeps its own set of the player's missions. */
const PERIODS: Record<MissionPeriod, PeriodConfig> = {
  daily: { pool: MISSION_POOL, count: DAILY_MISSION_COUNT, start: utcDayStart },
  weekly: { pool: WEEKLY_MISSION_POOL, count: WEEKLY_MISSION_COUNT, start: utcWeekStart },
  dev: { pool: DEV_MISSION_POOL, count: 1, start: utcDayStart },
};

/** Mission rows are shared templates, matched by their full definition. */
async function missionIdsFor(tx: Tx, defs: readonly MissionDefinition[]): Promise<string[]> {
  const existing = await tx.mission.findMany({ where: { description: { in: defs.map(p => p.description) } } });
  const ids: string[] = [];
  for (const def of defs) {
    const match = existing.find(m =>
      m.description === def.description && m.type === def.type &&
      m.targetValue === def.targetValue && m.reward === def.reward,
    );
    ids.push(match ? match.id : (await tx.mission.create({ data: def })).id);
  }
  return ids;
}

type HeldMission = { createdAt: Date; period: string };

/** Whether any of the player's mission sets is missing or from a previous period. */
function setsOutdated(held: HeldMission[], hasGithub: boolean, now: Date): boolean {
  return (Object.keys(PERIODS) as MissionPeriod[]).some(period => {
    const rows = held.filter(m => m.period === period);
    if (period === 'dev' && !hasGithub) return rows.length > 0;
    return needsNewSet(rows.map(m => m.createdAt), PERIODS[period].start(now));
  });
}

/**
 * Makes sure the player holds the current daily, weekly and (with GitHub
 * connected) dev missions, replacing outdated sets with new random ones. Must
 * run under the user lock so two parallel calls can't both assign a set.
 */
async function ensureMissions(tx: Tx, userId: string, now = new Date()) {
  const current = await tx.userMission.findMany({ where: { userId }, include: userMissionInclude });
  const hasGithub = !!(await tx.account.findFirst({ where: { userId, provider: 'github' }, select: { id: true } }));
  if (!setsOutdated(current, hasGithub, now)) return current;

  for (const period of Object.keys(PERIODS) as MissionPeriod[]) {
    const rows = current.filter(m => m.period === period);
    const config = PERIODS[period];
    if (period === 'dev' && !hasGithub) {
      if (rows.length) await tx.userMission.deleteMany({ where: { userId, period } });
      continue;
    }
    if (!needsNewSet(rows.map(m => m.createdAt), config.start(now))) continue;
    const picked = pickDailyMissions(config.pool, config.count, n => randomInt(0, n));
    const missionIds = await missionIdsFor(tx, picked);
    await tx.userMission.deleteMany({ where: { userId, period } });
    await tx.userMission.createMany({ data: missionIds.map(missionId => ({ userId, missionId, period, createdAt: now })) });
  }
  return tx.userMission.findMany({ where: { userId }, include: userMissionInclude });
}

/** The player's current missions (daily, weekly, dev), each with the `required` count to complete it. */
export async function getUserMissions(userId: string) {
  const now = new Date();
  let missions = await prisma.userMission.findMany({ where: { userId }, include: userMissionInclude });
  const hasGithub = !!(await prisma.account.findFirst({ where: { userId, provider: 'github' }, select: { id: true } }));

  // Only take the lock when a set must be (re)assigned (first visit of the day or week)
  if (setsOutdated(missions, hasGithub, now)) {
    missions = await withUserLock(userId, tx => ensureMissions(tx, userId, now));
  }

  return missions.map(um => ({
    ...um,
    period: um.period as MissionPeriod,
    required: missionRequiredCount(um.mission.type, um.mission.targetValue),
  }));
}

export async function advanceMissionProgress(userId: string, type: string, targetValue?: string) {
  // Locked so two parallel progress events can't both complete (and pay) the same mission.
  return withUserLock(userId, async (tx) => {
    // Progress always goes to the current missions, even if the player hasn't opened the store yet.
    // Daily and weekly missions both count the event; dev missions are checked on GitHub instead.
    const missions = await ensureMissions(tx, userId);
    const activeMissions = missions.filter(um => !um.completed && um.period !== 'dev' && um.mission.type === type);

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


/**
 * Checks today's dev mission on GitHub (public events of the connected
 * account) and pays it once when the activity is there. GitHub can list an
 * event a few minutes late, so "not yet" is a normal answer.
 */
export async function checkDevMission(userId: string): Promise<{ done: boolean; reward?: number; login?: string }> {
  const missions = await getUserMissions(userId);
  const dev = missions.find(m => m.period === 'dev');
  if (!dev) throw new UserFacingError('Connect your GitHub account to get dev missions', 400);
  if (dev.completed) return { done: true };

  const account = await prisma.account.findFirst({ where: { userId, provider: 'github' }, select: { access_token: true } });
  const token = account?.access_token ?? undefined;
  const login = token ? await getTokenOwnerLogin(token) : null;
  if (!login) throw new UserFacingError('GitHub no longer accepts your connection. Reconnect it in your profile.', 400);

  // Slow call: outside the lock
  const events = await fetchPublicEvents(login, token);
  if (!githubActivityDone(events, dev.mission.targetValue, utcDayStart(new Date()))) return { done: false, login };

  return withUserLock(userId, async (tx) => {
    const row = await tx.userMission.findUnique({ where: { id: dev.id }, include: userMissionInclude });
    if (!row || row.completed) return { done: true, login };
    await tx.userMission.update({ where: { id: row.id }, data: { progress: 1, completed: true } });
    await grantXP(userId, XP_AMOUNTS.COMPLETE_DAILY_CHALLENGE, row.mission.reward, tx);
    return { done: true, reward: row.mission.reward, login };
  });
}

/** One swap per UTC day: replaces an unfinished daily mission with another one from the pool. */
export async function rerollDailyMission(userId: string, userMissionId: string) {
  return withUserLock(userId, async (tx) => {
    const now = new Date();
    const user = await tx.user.findUnique({ where: { id: userId }, select: { missionRerollAt: true } });
    if (user?.missionRerollAt && user.missionRerollAt.getTime() >= utcDayStart(now).getTime()) {
      throw new UserFacingError('You already swapped a mission today', 409);
    }
    const missions = await ensureMissions(tx, userId, now);
    const target = missions.find(m => m.id === userMissionId);
    if (!target || target.period !== 'daily') throw new UserFacingError('Mission not found', 404);
    if (target.completed) throw new UserFacingError('This mission is already done');

    const held = new Set(missions.filter(m => m.period === 'daily').map(m => m.mission.description));
    const options = MISSION_POOL.filter(m => !held.has(m.description));
    if (options.length === 0) throw new UserFacingError('No other mission to swap to');
    const replacement = options[randomInt(0, options.length)];
    const [missionId] = await missionIdsFor(tx, [replacement]);

    await tx.userMission.update({ where: { id: target.id }, data: { missionId, progress: 0 } });
    await tx.user.update({ where: { id: userId }, data: { missionRerollAt: now } });
    return replacement;
  });
}

export async function grantCurrency(userId: string, amount: number) {
  return prisma.user.update({
    where: { id: userId },
    data: { currency: { increment: amount } }
  });
}

/** Login-calendar status of the player (for the store's 7-day calendar). Null when the user doesn't exist. */
export async function getDailyStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastDailyClaimAt: true, loginStreak: true },
  });
  if (!user) return null;
  return loginCalendarState(user.loginStreak, user.lastDailyClaimAt, new Date());
}

/**
 * Daily reward with a 7-day login calendar: one claim every 24h; claiming within
 * 48h of the previous claim moves the streak forward (1 → 7, then a new cycle),
 * otherwise it restarts at day 1. Day 7 also adds a booster to the inventory.
 */
export async function claimDailyReward(userId: string) {
  return withUserLock(userId, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { lastDailyClaimAt: true, loginStreak: true }
    });

    if (!user) return { success: false as const, error: 'User not found' };

    const now = new Date();
    const status = loginCalendarState(user.loginStreak, user.lastDailyClaimAt, now);

    if (!status.canClaim && user.lastDailyClaimAt) {
      return {
        success: false as const,
        error: 'Daily reward already claimed',
        nextClaimAt: new Date(user.lastDailyClaimAt.getTime() + DAILY_COOLDOWN_MS).toISOString(),
        remainingMs: status.remainingMs,
        streak: status,
      };
    }

    const day = nextStreakDay(user.loginStreak, user.lastDailyClaimAt, now);
    const reward = rewardForDay(day);

    // XP (and the BITS) first: a level-up may add boosters to the inventory, read it afterwards
    const xpResult = await grantXP(userId, XP_AMOUNTS.LOGIN_STREAK, reward.bits, tx);

    let packGranted: InventoryItem | null = null;
    const data: Prisma.UserUpdateInput = { lastDailyClaimAt: now, loginStreak: day };
    if (reward.packId) {
      const pack = getPackById(reward.packId);
      const after = await tx.user.findUnique({ where: { id: userId }, select: { inventory: true } });
      packGranted = {
        packId: reward.packId,
        packName: pack?.name ?? reward.packName ?? reward.packId,
        acquiredAt: now.toISOString(),
        source: 'login_streak',
      };
      data.inventory = [...asArray<InventoryItem>(after?.inventory), packGranted] as unknown as Prisma.InputJsonValue;
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data,
      select: { currency: true },
    });

    return {
      success: true as const,
      amount: reward.bits,
      newCurrency: updated.currency,
      xpResult,
      nextClaimAt: new Date(now.getTime() + DAILY_COOLDOWN_MS).toISOString(),
      day,
      packGranted,
      streak: loginCalendarState(day, now, now),
    };
  });
}
