/**
 * 7-day login calendar (pure logic, shared by the server and the store UI).
 *
 * The daily reward can be claimed once every 24h. Claiming within 48h of the
 * previous claim continues the streak (day 1 → 7, then a new cycle starts at 1);
 * waiting longer resets it to day 1.
 */

export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A claim made at most this long after the previous one keeps the streak alive. */
export const LOGIN_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
export const LOGIN_CALENDAR_DAYS = 7;

export interface LoginDayReward {
  day: number;
  bits: number;
  /** Booster added to the inventory on this day (source 'login_streak'). */
  packId?: string;
  packName?: string;
}

export const LOGIN_CALENDAR_REWARDS: readonly LoginDayReward[] = [
  { day: 1, bits: 100 },
  { day: 2, bits: 120 },
  { day: 3, bits: 150 },
  { day: 4, bits: 180 },
  { day: 5, bits: 220 },
  { day: 6, bits: 260 },
  { day: 7, bits: 300, packId: 'mystery-box', packName: 'The Mystery Box' },
];

export function rewardForDay(day: number): LoginDayReward {
  const clamped = Math.min(Math.max(Math.floor(day) || 1, 1), LOGIN_CALENDAR_DAYS);
  return LOGIN_CALENDAR_REWARDS[clamped - 1];
}

/** Whether a previous claim still keeps the streak alive at `now`. */
export function isStreakAlive(lastClaimAt: Date | null, now: Date): boolean {
  if (!lastClaimAt) return false;
  return now.getTime() - lastClaimAt.getTime() <= LOGIN_STREAK_WINDOW_MS;
}

/** Calendar day a claim made at `now` would pay (1–7). */
export function nextStreakDay(loginStreak: number, lastClaimAt: Date | null, now: Date): number {
  if (loginStreak < 1 || !isStreakAlive(lastClaimAt, now)) return 1;
  return (Math.min(loginStreak, LOGIN_CALENDAR_DAYS) % LOGIN_CALENDAR_DAYS) + 1;
}

export type CalendarDayState = 'claimed' | 'today' | 'upcoming';

export interface LoginCalendarState {
  canClaim: boolean;
  /** Time until the next claim (0 when it can be claimed now). */
  remainingMs: number;
  /** Day of the current cycle already claimed (0 when the streak is broken or a new cycle starts). */
  claimedDay: number;
  /** Day the next claim pays (now when `canClaim`, otherwise after `remainingMs`). */
  nextDay: number;
  nextReward: LoginDayReward;
  /** When the streak is lost if the player doesn't claim (null when there is no live streak). */
  streakExpiresAt: string | null;
  days: (LoginDayReward & { state: CalendarDayState })[];
}

export function loginCalendarState(loginStreak: number, lastClaimAt: Date | null, now: Date): LoginCalendarState {
  const sinceLast = lastClaimAt ? now.getTime() - lastClaimAt.getTime() : Infinity;
  const onCooldown = sinceLast < DAILY_COOLDOWN_MS;
  const alive = loginStreak >= 1 && isStreakAlive(lastClaimAt, now);

  // On cooldown the streak is alive by definition; the cycle shows what was claimed today
  const claimedDay = alive ? Math.min(loginStreak, LOGIN_CALENDAR_DAYS) : 0;
  const nextDay = alive ? (claimedDay % LOGIN_CALENDAR_DAYS) + 1 : 1;
  // A completed cycle (day 7 claimed) is shown in full until the next claim starts a new one
  const shownClaimed = onCooldown ? claimedDay : (nextDay === 1 ? 0 : claimedDay);

  const days = LOGIN_CALENDAR_REWARDS.map(r => ({
    ...r,
    state: (r.day <= shownClaimed
      ? 'claimed'
      : !onCooldown && r.day === nextDay ? 'today' : 'upcoming') as CalendarDayState,
  }));

  return {
    canClaim: !onCooldown,
    remainingMs: onCooldown ? DAILY_COOLDOWN_MS - sinceLast : 0,
    claimedDay,
    nextDay,
    nextReward: rewardForDay(nextDay),
    streakExpiresAt: alive && lastClaimAt ? new Date(lastClaimAt.getTime() + LOGIN_STREAK_WINDOW_MS).toISOString() : null,
    days,
  };
}
