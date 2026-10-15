import { test } from 'node:test';
import assert from 'node:assert';
import { mulberry32, syntheticDeveloper } from './balanceSim';
import { buildDevStats } from './githubService';
import { RARITY_ORDER } from './rarity';
import { computeCardStats } from './cardStats';
import { devStatInputs, livingCardUpdate, statsChanged } from './livingCards';

test('for the same rarity, a refresh gives exactly the stats of a fresh draw', () => {
  const rng = mulberry32(42);
  for (const band of RARITY_ORDER) {
    for (let i = 0; i < 20; i++) {
      const { user, repos } = syntheticDeveloper(rng, band, i);
      const dev = buildDevStats(user, repos);
      const update = livingCardUpdate({ rarity: dev.rarity, atk: 0, def: 0, hp: 0 }, dev)!;
      assert.deepStrictEqual({ atk: update.atk, def: update.def, hp: update.hp }, { atk: dev.atk, def: dev.def, hp: dev.hp }, `${band} #${i}`);
    }
  }
});

test('the card keeps its rarity; a developer who drifted to another rarity keeps the old stats', () => {
  const rng = mulberry32(7);
  const { user, repos } = syntheticDeveloper(rng, 'Epic', 1);
  const dev = buildDevStats(user, repos);
  const now = new Date();
  // Same rarity: recomputed with the current formula
  const same = livingCardUpdate({ rarity: dev.rarity, atk: 1, def: 1, hp: 1 }, dev, now)!;
  assert.strictEqual(same.drifted, false);
  assert.deepStrictEqual({ atk: same.atk, def: same.def, hp: same.hp }, computeCardStats(devStatInputs(dev, now)!, dev.rarity as 'Epic'));
  // The card is Common but the profile is now Epic: stats stay, cosmetics refresh
  const drifted = livingCardUpdate({ rarity: 'Common', atk: 45, def: 40, hp: 527 }, dev, now)!;
  assert.strictEqual(drifted.drifted, true);
  assert.deepStrictEqual({ atk: drifted.atk, def: drifted.def, hp: drifted.hp }, { atk: 45, def: 40, hp: 527 });
  assert.strictEqual(drifted.avatarUrl, dev.avatarUrl);
  // Rarity and language are never part of the update
  for (const u of [same, drifted]) assert.ok(!('rarity' in u) && !('primaryLanguage' in u));
});

test('incomplete data or an unknown rarity refreshes nothing', () => {
  const rng = mulberry32(3);
  const { user, repos } = syntheticDeveloper(rng, 'Common', 0);
  const dev = buildDevStats(user, repos);
  assert.strictEqual(livingCardUpdate({ rarity: 'Mythic', atk: 1, def: 1, hp: 1 }, dev), null);
  assert.strictEqual(livingCardUpdate({ rarity: 'Common', atk: 1, def: 1, hp: 1 }, { ...dev, githubCreatedAt: undefined }), null);
});

test('statsChanged compares the three stats', () => {
  const card = { rarity: 'Rare', atk: 10, def: 20, hp: 100 };
  assert.ok(!statsChanged(card, { atk: 10, def: 20, hp: 100 }));
  assert.ok(statsChanged(card, { atk: 11, def: 20, hp: 100 }));
});
