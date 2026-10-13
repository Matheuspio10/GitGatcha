import { test } from 'node:test';
import assert from 'node:assert';
import {
  DAILY_SPRINT_LANGUAGES,
  SPRINT_REWARDS,
  SPRINT_RESULTS_KEPT,
  WEEKLY_SPRINT_FAMILIES,
  rankWithTies,
  sprintPeriod,
  sprintRewardFor,
  sprintRewardsLegend,
  sprintThemeById,
} from './sprints';

test('a daily sprint runs from midnight to midnight UTC', () => {
  const p = sprintPeriod('daily', new Date('2026-10-13T23:59:00Z'));
  assert.strictEqual(p.id, 'daily:2026-10-13');
  assert.strictEqual(p.startsAt.toISOString(), '2026-10-13T00:00:00.000Z');
  assert.strictEqual(p.endsAt.toISOString(), '2026-10-14T00:00:00.000Z');
});

test('a weekly sprint runs from Monday to Monday UTC', () => {
  const p = sprintPeriod('weekly', new Date('2026-10-18T12:00:00Z')); // a Sunday
  assert.strictEqual(p.id, 'weekly:2026-10-12');
  assert.strictEqual(p.endsAt.toISOString(), '2026-10-19T00:00:00.000Z');
});

test('themes rotate: consecutive days and weeks get different themes, the cycle repeats', () => {
  const day = (n: number) => sprintPeriod('daily', new Date(Date.UTC(2026, 9, 13 + n))).theme.id;
  assert.notStrictEqual(day(0), day(1));
  assert.strictEqual(day(0), day(DAILY_SPRINT_LANGUAGES.length));
  const week = (n: number) => sprintPeriod('weekly', new Date(Date.UTC(2026, 9, 12 + 7 * n))).theme.id;
  assert.notStrictEqual(week(0), week(1));
  assert.strictEqual(week(0), week(WEEKLY_SPRINT_FAMILIES.length));
});

test('a stored theme id gives the same theme back', () => {
  const daily = sprintPeriod('daily', new Date('2026-10-13T10:00:00Z')).theme;
  assert.deepStrictEqual(sprintThemeById(daily.id), daily);
  for (const f of WEEKLY_SPRINT_FAMILIES) assert.deepStrictEqual(sprintThemeById(f.id), f);
  assert.deepStrictEqual(sprintThemeById('lang:Zig').languages, ['Zig']);
});

test('ties share the position and the next one skips (1, 1, 3)', () => {
  const ranked = rankWithTies([{ score: 900 }, { score: 900 }, { score: 700 }, { score: 700 }, { score: 700 }, { score: 10 }]);
  assert.deepStrictEqual(ranked.map(r => r.position), [1, 1, 3, 3, 3, 6]);
  assert.deepStrictEqual(rankWithTies([]), []);
});

test('rewards by position: tied winners each get the 1st place prize, nothing past the table', () => {
  assert.strictEqual(sprintRewardFor('daily', 1), SPRINT_REWARDS.daily[0].bits);
  const last = SPRINT_REWARDS.daily[SPRINT_REWARDS.daily.length - 1];
  assert.strictEqual(sprintRewardFor('daily', last.upTo), last.bits);
  assert.strictEqual(sprintRewardFor('daily', last.upTo + 1), 0);
  assert.strictEqual(sprintRewardFor('weekly', 0), 0);
  for (const kind of ['daily', 'weekly'] as const) {
    const table = SPRINT_REWARDS[kind];
    for (let i = 1; i < table.length; i++) {
      assert.ok(table[i].upTo > table[i - 1].upTo);
      assert.ok(table[i].bits < table[i - 1].bits);
    }
    assert.ok(table[table.length - 1].upTo <= SPRINT_RESULTS_KEPT);
  }
  assert.ok(SPRINT_REWARDS.weekly[0].bits > SPRINT_REWARDS.daily[0].bits);
});

test('the rewards legend reads the table', () => {
  const [first, second, , rest] = SPRINT_REWARDS.daily;
  const legend = sprintRewardsLegend('daily');
  assert.ok(legend.startsWith(`1st ${first.bits} · 2nd ${second.bits} · `), legend);
  assert.ok(legend.endsWith(`4th–${rest.upTo}th ${rest.bits}`), legend);
});
