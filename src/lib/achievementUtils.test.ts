import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  achievementKey,
  ACHIEVEMENTS,
  AchievementStats,
  buildAchievementViews,
  describeTier,
  getAchievementDef,
  newlyReachedTiers,
  tierForValue,
  tierName,
} from './achievementUtils';

const zero: AchievementStats = {
  uniqueCards: 0, legendaryCards: 0, shinyCards: 0, languages: 0, pveWins: 0,
  pvpWins: 0, friends: 0, level: 1, topLoyalty: 0, signature: 0,
};

describe('achievement definitions', () => {
  test('unique ids, 1–3 ascending tiers with positive rewards', () => {
    assert.strictEqual(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      assert.ok(a.tiers.length >= 1 && a.tiers.length <= 3, a.id);
      for (let i = 0; i < a.tiers.length; i++) {
        assert.ok(a.tiers[i].reward > 0, a.id);
        if (i > 0) {
          assert.ok(a.tiers[i].threshold > a.tiers[i - 1].threshold, `${a.id} thresholds ascend`);
          assert.ok(a.tiers[i].reward >= a.tiers[i - 1].reward, `${a.id} rewards grow`);
        }
      }
      assert.ok(a.stat in zero, `${a.id} uses a known stat`);
    }
  });

  test('tier names and descriptions', () => {
    assert.deepStrictEqual([1, 2, 3].map(tierName), ['Bronze', 'Silver', 'Gold']);
    const collector = getAchievementDef('collector')!;
    assert.strictEqual(describeTier(collector, 2), 'Own 50 different cards');
  });
});

describe('tier computation', () => {
  const collector = getAchievementDef('collector')!; // 10 / 50 / 150

  test('highest tier reached by a value', () => {
    assert.strictEqual(tierForValue(collector, 0), 0);
    assert.strictEqual(tierForValue(collector, 9), 0);
    assert.strictEqual(tierForValue(collector, 10), 1);
    assert.strictEqual(tierForValue(collector, 149), 2);
    assert.strictEqual(tierForValue(collector, 1000), 3);
  });

  test('newly reached tiers skip the ones already unlocked and include skipped lower tiers', () => {
    const stats = { ...zero, uniqueCards: 60, signature: 1 };
    const got = newlyReachedTiers(stats, new Set([achievementKey('collector', 1)]));
    assert.deepStrictEqual(got.map(g => [g.def.id, g.tier, g.reward]), [['collector', 2, 300], ['self_portrait', 1, 200]]);
    // A player jumping straight past bronze still gets (and is paid) every tier
    const fresh = newlyReachedTiers({ ...zero, legendaryCards: 6 }, new Set());
    assert.deepStrictEqual(fresh.map(g => g.tier), [1, 2]);
  });

  test('nothing new once every reached tier is persisted', () => {
    const stats = { ...zero, uniqueCards: 60 };
    const unlocked = new Set([achievementKey('collector', 1), achievementKey('collector', 2)]);
    assert.deepStrictEqual(newlyReachedTiers(stats, unlocked), []);
  });
});

describe('achievement views', () => {
  test('locked achievement shows its first requirement and progress', () => {
    const view = buildAchievementViews({ ...zero, uniqueCards: 4 }, new Map()).find(v => v.id === 'collector')!;
    assert.strictEqual(view.unlocked, false);
    assert.strictEqual(view.tier, 0);
    assert.strictEqual(view.description, 'Own 10 different cards');
    assert.strictEqual(view.nextThreshold, 10);
    assert.strictEqual(view.nextReward, 100);
    assert.strictEqual(view.progressPercent, 40);
  });

  test('persisted tiers drive the state; maxed achievements are at 100%', () => {
    const at = new Date('2026-10-01T00:00:00.000Z');
    const unlocked = new Map([
      [achievementKey('collector', 1), at],
      [achievementKey('self_portrait', 1), at],
    ]);
    const views = buildAchievementViews({ ...zero, uniqueCards: 25, signature: 1 }, unlocked);
    const collector = views.find(v => v.id === 'collector')!;
    assert.strictEqual(collector.tier, 1);
    assert.strictEqual(collector.nextThreshold, 50);
    assert.strictEqual(collector.progressPercent, 50);
    assert.deepStrictEqual(collector.tiers.map(t => t.unlocked), [true, false, false]);
    assert.strictEqual(collector.tiers[0].unlockedAt, at.toISOString());

    const sig = views.find(v => v.id === 'self_portrait')!;
    assert.strictEqual(sig.tier, 1);
    assert.strictEqual(sig.maxTier, 1);
    assert.strictEqual(sig.nextThreshold, null);
    assert.strictEqual(sig.progressPercent, 100);
  });
});
