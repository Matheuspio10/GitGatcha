import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  MISSION_POOL,
  WEEKLY_MISSION_POOL,
  WEEKLY_MISSION_COUNT,
  DEV_MISSION_POOL,
  githubActivityDone,
  needsNewSet,
  nextWeeklyReset,
  utcWeekStart,
  missionMatchesEvent,
  missionRequiredCount,
  needsNewMissions,
  nextMissionReset,
  pickDailyMissions,
  rarityMeetsTarget,
  utcDayStart,
} from './missionUtils';

describe('mission day logic', () => {
  const now = new Date('2026-10-12T15:00:00.000Z');

  test('UTC day start and next reset', () => {
    assert.strictEqual(utcDayStart(now).toISOString(), '2026-10-12T00:00:00.000Z');
    assert.strictEqual(nextMissionReset(now).toISOString(), '2026-10-13T00:00:00.000Z');
    assert.strictEqual(nextMissionReset(new Date('2026-10-12T23:59:59.999Z')).toISOString(), '2026-10-13T00:00:00.000Z');
  });

  test('needs new missions when none, or any is from a previous UTC day', () => {
    assert.strictEqual(needsNewMissions([], now), true);
    assert.strictEqual(needsNewMissions([new Date('2026-10-12T00:00:00.000Z'), new Date('2026-10-12T14:00:00.000Z')], now), false);
    assert.strictEqual(needsNewMissions([new Date('2026-10-11T23:59:59.999Z')], now), true);
    assert.strictEqual(needsNewMissions([new Date('2026-10-12T01:00:00.000Z'), new Date('2026-09-01T10:00:00.000Z')], now), true);
  });
});

describe('rarityMeetsTarget', () => {
  test('target rarity or higher', () => {
    assert.strictEqual(rarityMeetsTarget('Rare', 'Rare'), true);
    assert.strictEqual(rarityMeetsTarget('Epic', 'Rare'), true);
    assert.strictEqual(rarityMeetsTarget('Legendary', 'Rare'), true);
    assert.strictEqual(rarityMeetsTarget('Uncommon', 'Rare'), false);
    assert.strictEqual(rarityMeetsTarget('Common', 'Rare'), false);
    assert.strictEqual(rarityMeetsTarget('Mythic', 'Rare'), false);
    assert.strictEqual(rarityMeetsTarget(undefined, 'Rare'), false);
  });
});

describe('mission matching and counts', () => {
  test('required counts', () => {
    assert.strictEqual(missionRequiredCount('OPEN_BOOSTER', '3'), 3);
    assert.strictEqual(missionRequiredCount('WIN_BATTLE', null), 1);
    assert.strictEqual(missionRequiredCount('COLLECT_RARITY', 'Rare'), 1);
    assert.strictEqual(missionRequiredCount('COLLECT_RARITY', 'Uncommon:3'), 3);
    assert.strictEqual(missionRequiredCount('COLLECT_LANGUAGE', 'Python'), 1);
    assert.strictEqual(missionRequiredCount('COLLECT_LANGUAGE', 'C++:2'), 2);
  });

  test('COLLECT_RARITY counts higher rarities', () => {
    assert.strictEqual(missionMatchesEvent('COLLECT_RARITY', 'Rare', 'Legendary'), true);
    assert.strictEqual(missionMatchesEvent('COLLECT_RARITY', 'Uncommon:3', 'Uncommon'), true);
    assert.strictEqual(missionMatchesEvent('COLLECT_RARITY', 'Rare', 'Common'), false);
  });

  test('COLLECT_LANGUAGE matches the language only', () => {
    assert.strictEqual(missionMatchesEvent('COLLECT_LANGUAGE', 'Python', 'Python'), true);
    assert.strictEqual(missionMatchesEvent('COLLECT_LANGUAGE', 'Python', 'python'), true);
    assert.strictEqual(missionMatchesEvent('COLLECT_LANGUAGE', 'Python', 'JavaScript'), false);
    assert.strictEqual(missionMatchesEvent('COLLECT_LANGUAGE', 'Python', undefined), false);
  });

  test('count missions match every event', () => {
    assert.strictEqual(missionMatchesEvent('OPEN_BOOSTER', '3'), true);
    assert.strictEqual(missionMatchesEvent('WIN_BATTLE', '2'), true);
  });
});

describe('pickDailyMissions', () => {
  test('picks distinct missions of distinct types when possible', () => {
    for (let seed = 0; seed < 50; seed++) {
      let state = seed + 1;
      const rnd = (n: number) => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state % n;
      };
      const picked = pickDailyMissions(MISSION_POOL, 3, rnd);
      assert.strictEqual(picked.length, 3);
      assert.strictEqual(new Set(picked.map(p => p.description)).size, 3);
      assert.strictEqual(new Set(picked.map(p => p.type)).size, 3);
    }
  });

  test('fills with repeated types when the pool lacks variety', () => {
    const pool = [{ type: 'A', id: 1 }, { type: 'A', id: 2 }, { type: 'B', id: 3 }];
    const picked = pickDailyMissions(pool, 3, () => 0);
    assert.strictEqual(picked.length, 3);
    assert.strictEqual(new Set(picked.map(p => p.id)).size, 3);
  });

  test('pool has ~15 valid missions with unique descriptions', () => {
    assert.ok(MISSION_POOL.length >= 15);
    assert.strictEqual(new Set(MISSION_POOL.map(m => m.description)).size, MISSION_POOL.length);
    for (const m of MISSION_POOL) assert.ok(missionRequiredCount(m.type, m.targetValue) >= 1);
  });
});

describe('weekly and dev missions', () => {
  test('weeks start on Monday 00:00 UTC', () => {
    // 2026-10-15 is a Thursday
    assert.strictEqual(utcWeekStart(new Date('2026-10-15T13:00:00Z')).toISOString(), '2026-10-12T00:00:00.000Z');
    assert.strictEqual(utcWeekStart(new Date('2026-10-12T00:00:00Z')).toISOString(), '2026-10-12T00:00:00.000Z');
    assert.strictEqual(utcWeekStart(new Date('2026-10-18T23:59:59Z')).toISOString(), '2026-10-12T00:00:00.000Z');
    assert.strictEqual(nextWeeklyReset(new Date('2026-10-15T13:00:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
  });

  test('a set from before the period is replaced', () => {
    const week = utcWeekStart(new Date('2026-10-15T13:00:00Z'));
    assert.strictEqual(needsNewSet([], week), true);
    assert.strictEqual(needsNewSet([new Date('2026-10-12T08:00:00Z')], week), false);
    assert.strictEqual(needsNewSet([new Date('2026-10-11T23:00:00Z')], week), true);
  });

  test('GitHub activity must match the type, the action and today', () => {
    const today = new Date('2026-10-13T00:00:00Z');
    const events = [
      { type: 'PushEvent', created_at: '2026-10-12T22:00:00Z' },
      { type: 'PullRequestEvent', created_at: '2026-10-13T09:00:00Z', payload: { action: 'closed' } },
      { type: 'IssuesEvent', created_at: '2026-10-13T10:00:00Z', payload: { action: 'opened' } },
    ];
    assert.strictEqual(githubActivityDone(events, 'PushEvent', today), false); // yesterday
    assert.strictEqual(githubActivityDone(events, 'PullRequestEvent:opened', today), false); // wrong action
    assert.strictEqual(githubActivityDone(events, 'IssuesEvent:opened', today), true);
    assert.strictEqual(githubActivityDone(events, null, today), false);
  });

  test('every pool mission has a sensible target', () => {
    for (const m of [...WEEKLY_MISSION_POOL, ...DEV_MISSION_POOL]) {
      assert.ok(m.reward > 0 && m.targetValue);
    }
    assert.ok(WEEKLY_MISSION_POOL.length >= WEEKLY_MISSION_COUNT);
  });
});
