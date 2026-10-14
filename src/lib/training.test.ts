import { test } from 'node:test';
import assert from 'node:assert';
import { resolve3v3Battle, type BattleCard } from './battleResolver';
import { RARITY_ORDER } from './rarity';
import {
  TRAINING_BONUS_PER_LEVEL,
  TRAINING_MAX_LEVEL,
  clampTrainingLevel,
  fullTrainingCost,
  maxTrainingLevel,
  trainedStats,
  trainingCost,
  trainingMultiplier,
} from './training';

test('each level adds the same bonus, up to the cap of the rarity', () => {
  assert.strictEqual(trainingMultiplier(0, 'Rare'), 1);
  assert.strictEqual(trainingMultiplier(2, 'Rare'), 1 + 2 * TRAINING_BONUS_PER_LEVEL);
  // Stored levels above the cap (a cap lowered later) count as the cap
  assert.strictEqual(trainingMultiplier(99, 'Legendary'), 1 + TRAINING_MAX_LEVEL.Legendary * TRAINING_BONUS_PER_LEVEL);
  assert.strictEqual(clampTrainingLevel(-3, 'Common'), 0);
  assert.strictEqual(clampTrainingLevel(undefined, 'Common'), 0);
  assert.strictEqual(clampTrainingLevel(2.7, 'Common'), 2);
});

test('commons can be trained at least as far as any rarer card', () => {
  for (const r of RARITY_ORDER) assert.ok(maxTrainingLevel('Common') >= maxTrainingLevel(r), r);
  assert.strictEqual(maxTrainingLevel('Mythic'), maxTrainingLevel('Common')); // unknown rarity
});

test('every level costs more than the one before, and nothing past the cap', () => {
  for (const r of RARITY_ORDER) {
    let prev = { bits: 0, fragments: 0 };
    for (let level = 0; level < maxTrainingLevel(r); level++) {
      const cost = trainingCost(level, r);
      assert.ok(cost, `${r} ${level}`);
      assert.ok(cost.bits > prev.bits && cost.fragments > prev.fragments, `${r} ${level}`);
      prev = cost;
    }
    assert.strictEqual(trainingCost(maxTrainingLevel(r), r), null);
  }
  // Level n costs n steps: 1 + 2 + 3 for a card trained to 3
  assert.deepStrictEqual(trainingCost(2, 'Rare'), { bits: 600, fragments: 60 });
  const full = fullTrainingCost('Legendary');
  assert.ok(full.bits > 0 && full.fragments > 0);
});

test('trained stats round down like the battle does', () => {
  assert.deepStrictEqual(trainedStats({ atk: 50, def: 75, hp: 601, rarity: 'Common' }, 3), { atk: 53, def: 79, hp: 637 });
});

test('the battle applies the training bonus to the trained card only', () => {
  const card = (id: string, trainingLevel: number): BattleCard => ({
    id, name: id, atk: 100, def: 100, hp: 1000, maxHp: 1000, stamina: 100,
    rarity: 'Rare', primaryLanguage: null, type: 'Neutral', loyaltyTier: 'none', trainingLevel,
  });
  const result = resolve3v3Battle(
    [card('t1', 4), card('t2', 4), card('t3', 4)],
    [card('u1', 0), card('u2', 0), card('u3', 0)],
    { rng: () => 0.5 },
  );
  const trained = result.challengerTeamState[0];
  const untrained = result.defenderTeamState[0];
  assert.strictEqual(trained.maxHp, Math.floor(1000 * trainingMultiplier(4, 'Rare')));
  assert.strictEqual(untrained.maxHp, 1000);
  assert.strictEqual(result.winner, 'CHALLENGER');
});
