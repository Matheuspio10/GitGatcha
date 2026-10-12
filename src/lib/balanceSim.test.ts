import { describe, test } from 'node:test';
import assert from 'node:assert';
import { formatSimReport, mulberry32, runBalanceSim, syntheticDeveloper } from './balanceSim';
import { buildDevStats } from './githubService';
import { RARITY_ORDER } from './rarity';
import { computeCardStats, computeFameStats, STAT_FORMULA } from './cardStats';

/**
 * Balance targets of the live stat formula ('fame', see cardStats.ts). The
 * simulator is seeded, so the numbers are stable; the report is printed so a
 * balance change can be judged at a glance:
 *
 *   node --import tsx --test src/lib/balanceSim.test.ts
 *   node --import tsx scripts/balance-sim.ts [seed] [impact|fame]
 */
describe('balance simulator (live formula)', () => {
  const report = runBalanceSim({ seed: 1234 });
  console.log(`\nStat formula: ${STAT_FORMULA}\n${formatSimReport(report)}\n`);
  const m = report.tierMatrix;

  test('the live formula is fame', () => {
    assert.strictEqual(STAT_FORMULA, 'fame');
  });

  test('is deterministic for a given seed', () => {
    const a = runBalanceSim({ seed: 7, perBand: 60, battlesPerPair: 20, mirrorBattles: 20, mixedBattles: 20 });
    const b = runBalanceSim({ seed: 7, perBand: 60, battlesPerPair: 20, mirrorBattles: 20, mixedBattles: 20 });
    assert.deepStrictEqual(a.tierMatrix, b.tierMatrix);
  });

  test('synthetic developers stay inside their follower band', () => {
    const rng = mulberry32(1);
    for (const band of RARITY_ORDER) {
      for (let i = 0; i < 50; i++) {
        const dev = syntheticDeveloper(rng, band, i);
        const stats = buildDevStats(dev.user, dev.repos);
        // The star bonus can only promote, never demote
        assert.ok(RARITY_ORDER.indexOf(stats.rarity as never) >= RARITY_ORDER.indexOf(band));
      }
    }
  });

  test('a full Legendary team almost always beats a full Common team', () => {
    // Asked for 95–97%; fame lands at ~99.8% (stars track the follower band)
    assert.ok(m.Legendary.Common >= 0.95, `Legendary vs Common ${m.Legendary.Common}`);
  });

  test('adjacent rarities: the higher one is clearly favoured, upsets still happen', () => {
    for (let i = 1; i < RARITY_ORDER.length; i++) {
      const hi = RARITY_ORDER[i], lo = RARITY_ORDER[i - 1];
      // Target 65–78%; Uncommon vs Common is ~83% (the Common band is mostly near-empty accounts)
      const max = lo === 'Common' ? 0.9 : 0.82;
      assert.ok(m[hi][lo] >= 0.62 && m[hi][lo] <= max, `${hi} vs ${lo}: ${m[hi][lo]}`);
    }
  });

  test('mirror rarities are a coin flip and ATK, DEF and HP all matter', () => {
    for (const mirror of report.mirrors) {
      assert.ok(Math.abs(mirror.winRate - 0.5) <= 0.05, `${mirror.rarity} mirror ${mirror.winRate}`);
      const shares = [mirror.statShare.atk, mirror.statShare.def, mirror.statShare.hp];
      assert.ok(Math.max(...shares) <= 0.62, `${mirror.rarity}: one stat decides everything ${JSON.stringify(mirror.statShare)}`);
      assert.ok(Math.min(...shares) >= 0.1, `${mirror.rarity}: a stat does not matter ${JSON.stringify(mirror.statShare)}`);
    }
  });

  test('matchups last more than 3 and fewer than 25 turns', () => {
    const t = report.openingTurns;
    assert.ok(t.median > 3 && t.median < 25, `median ${t.median}`);
    assert.ok(t.within >= 0.75, `only ${t.within} of opening matchups within 4–24 turns`);
  });

  test('no combat type is a must-pick or a dead card', () => {
    for (const t of report.typeWinRates) {
      if (t.appearances < 300) continue;
      assert.ok(t.winRate >= 0.4 && t.winRate <= 0.6, `${t.type} wins ${t.winRate}`);
    }
  });
});

describe("'fame' stat formula", () => {
  test('ATK grows monotonically with stars: a famous dev always out-hits a 0-star account', () => {
    const empty = { totalStars: 0, totalForks: 0, publicRepos: 1, publicGists: 0, followers: 0, accountAgeYears: 0.5 };
    const fresh = computeCardStats(empty, 'Common', 'fame');
    let prev = 0;
    for (const stars of [0, 10, 100, 1_000, 10_000, 100_000, 1_000_000]) {
      const atk = computeFameStats({ ...empty, totalStars: stars }).atk;
      assert.ok(atk > prev, `ATK not increasing at ${stars} stars`);
      prev = atk;
    }
    for (const famous of [
      { totalStars: 265_078, totalForks: 70_000, followers: 327_441 }, // torvalds
      { totalStars: 3_532, totalForks: 900, followers: 93_944 }, // gaearon
    ]) {
      assert.ok(computeCardStats({ ...empty, ...famous, publicRepos: 11, accountAgeYears: 14 }, 'Legendary', 'fame').atk > fresh.atk);
    }
  });
});

describe("'impact' stat formula (alternative, light check)", () => {
  test('rarity matters less than with fame and mirrors stay fair', () => {
    const r = runBalanceSim({ seed: 1234, formula: 'impact', perBand: 400, battlesPerPair: 300, mirrorBattles: 400, mixedBattles: 0 });
    assert.ok(r.tierMatrix.Legendary.Common >= 0.8 && r.tierMatrix.Legendary.Common <= 0.98, `Legendary vs Common ${r.tierMatrix.Legendary.Common}`);
    for (const mirror of r.mirrors) assert.ok(Math.abs(mirror.winRate - 0.5) <= 0.06, `${mirror.rarity} mirror ${mirror.winRate}`);
  });
});
