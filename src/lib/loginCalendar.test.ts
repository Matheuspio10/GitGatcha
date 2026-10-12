import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  DAILY_COOLDOWN_MS,
  LOGIN_CALENDAR_DAYS,
  LOGIN_CALENDAR_REWARDS,
  LOGIN_STREAK_WINDOW_MS,
  loginCalendarState,
  nextStreakDay,
  rewardForDay,
} from './loginCalendar';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-12T15:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('login calendar reward table', () => {
  test('7 days with growing BITS and a booster on day 7 only', () => {
    assert.strictEqual(LOGIN_CALENDAR_REWARDS.length, LOGIN_CALENDAR_DAYS);
    assert.deepStrictEqual(LOGIN_CALENDAR_REWARDS.map(r => r.day), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepStrictEqual(LOGIN_CALENDAR_REWARDS.map(r => r.bits), [100, 120, 150, 180, 220, 260, 300]);
    for (let i = 1; i < LOGIN_CALENDAR_REWARDS.length; i++) {
      assert.ok(LOGIN_CALENDAR_REWARDS[i].bits > LOGIN_CALENDAR_REWARDS[i - 1].bits);
    }
    assert.deepStrictEqual(LOGIN_CALENDAR_REWARDS.filter(r => r.packId).map(r => [r.day, r.packId]), [[7, 'mystery-box']]);
  });

  test('rewardForDay clamps out-of-range days', () => {
    assert.strictEqual(rewardForDay(0).day, 1);
    assert.strictEqual(rewardForDay(-3).day, 1);
    assert.strictEqual(rewardForDay(9).day, 7);
    assert.strictEqual(rewardForDay(4).bits, 180);
  });
});

describe('streak transitions', () => {
  test('first claim ever is day 1', () => {
    assert.strictEqual(nextStreakDay(0, null, now), 1);
  });

  test('claiming within 48h advances the streak', () => {
    assert.strictEqual(nextStreakDay(1, ago(25 * HOUR), now), 2);
    assert.strictEqual(nextStreakDay(3, ago(47 * HOUR), now), 4);
    assert.strictEqual(nextStreakDay(6, ago(LOGIN_STREAK_WINDOW_MS), now), 7);
  });

  test('day 7 cycles back to day 1', () => {
    assert.strictEqual(nextStreakDay(7, ago(30 * HOUR), now), 1);
  });

  test('more than 48h resets to day 1', () => {
    assert.strictEqual(nextStreakDay(5, ago(LOGIN_STREAK_WINDOW_MS + 1), now), 1);
    assert.strictEqual(nextStreakDay(3, ago(10 * 24 * HOUR), now), 1);
  });

  test('a legacy claim without streak (0) starts at day 1', () => {
    assert.strictEqual(nextStreakDay(0, ago(30 * HOUR), now), 1);
  });
});

describe('calendar state', () => {
  test('on cooldown: claimed days so far, next day upcoming, remaining time', () => {
    const s = loginCalendarState(3, ago(2 * HOUR), now);
    assert.strictEqual(s.canClaim, false);
    assert.strictEqual(s.remainingMs, DAILY_COOLDOWN_MS - 2 * HOUR);
    assert.strictEqual(s.claimedDay, 3);
    assert.strictEqual(s.nextDay, 4);
    assert.deepStrictEqual(s.days.map(d => d.state), ['claimed', 'claimed', 'claimed', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    assert.strictEqual(s.streakExpiresAt, new Date(ago(2 * HOUR).getTime() + LOGIN_STREAK_WINDOW_MS).toISOString());
  });

  test('claimable with a live streak: next day is today', () => {
    const s = loginCalendarState(3, ago(30 * HOUR), now);
    assert.strictEqual(s.canClaim, true);
    assert.strictEqual(s.remainingMs, 0);
    assert.strictEqual(s.nextDay, 4);
    assert.strictEqual(s.nextReward.bits, 180);
    assert.deepStrictEqual(s.days.map(d => d.state), ['claimed', 'claimed', 'claimed', 'today', 'upcoming', 'upcoming', 'upcoming']);
  });

  test('broken streak: day 1 is today, nothing claimed', () => {
    const s = loginCalendarState(5, ago(3 * 24 * HOUR), now);
    assert.strictEqual(s.claimedDay, 0);
    assert.strictEqual(s.nextDay, 1);
    assert.strictEqual(s.streakExpiresAt, null);
    assert.deepStrictEqual(s.days.map(d => d.state), ['today', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  test('day 7 claimed: full cycle shown until the next claim starts a new one', () => {
    const cooling = loginCalendarState(7, ago(HOUR), now);
    assert.ok(cooling.days.every(d => d.state === 'claimed'));
    assert.strictEqual(cooling.nextDay, 1);
    const ready = loginCalendarState(7, ago(26 * HOUR), now);
    assert.strictEqual(ready.canClaim, true);
    assert.deepStrictEqual(ready.days.map(d => d.state), ['today', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  test('state agrees with nextStreakDay whenever a claim is possible', () => {
    for (const streak of [0, 1, 4, 6, 7]) {
      for (const hours of [24, 36, 48, 49, 200]) {
        const last = ago(hours * HOUR);
        assert.strictEqual(loginCalendarState(streak, last, now).nextDay, nextStreakDay(streak, last, now), `streak ${streak}, ${hours}h`);
      }
    }
  });
});
