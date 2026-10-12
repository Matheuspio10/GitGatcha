import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applyPity, packsUntilPity, pityCounterUpdate, pityDue, PITY_THRESHOLD } from './pity';

describe('legendary pity', () => {
  const pack = ['Common', 'Common', 'Uncommon', 'Rare', 'Epic'];

  test('due only after PITY_THRESHOLD - 1 packs without a Legendary', () => {
    assert.strictEqual(pityDue(0), false);
    assert.strictEqual(pityDue(PITY_THRESHOLD - 2), false);
    assert.strictEqual(pityDue(PITY_THRESHOLD - 1), true);
    assert.strictEqual(pityDue(PITY_THRESHOLD + 5), true);
  });

  test('upgrades the last slot when due', () => {
    const { rarities, triggered } = applyPity(pack, PITY_THRESHOLD - 1);
    assert.strictEqual(triggered, true);
    assert.deepStrictEqual(rarities, ['Common', 'Common', 'Uncommon', 'Rare', 'Legendary']);
    assert.deepStrictEqual(pack, ['Common', 'Common', 'Uncommon', 'Rare', 'Epic'], 'input is not mutated');
  });

  test('does nothing when not due, when a slot is already Legendary, or for an empty pack', () => {
    assert.deepStrictEqual(applyPity(pack, PITY_THRESHOLD - 2), { rarities: pack, triggered: false });
    const lucky = ['Common', 'Legendary', 'Common', 'Rare', 'Rare'];
    assert.deepStrictEqual(applyPity(lucky, PITY_THRESHOLD), { rarities: lucky, triggered: false });
    assert.deepStrictEqual(applyPity([], PITY_THRESHOLD), { rarities: [], triggered: false });
  });

  test('counter resets on a Legendary, otherwise counts one more', () => {
    assert.deepStrictEqual(pityCounterUpdate(true, false), { set: 0 });
    assert.deepStrictEqual(pityCounterUpdate(true, true), { set: 0 });
    assert.deepStrictEqual(pityCounterUpdate(false, false), { increment: 1 });
  });

  test('a consumed pity whose Legendary was not granted stays due', () => {
    // consumePity already reset the counter to 0
    const update = pityCounterUpdate(false, true);
    assert.ok('increment' in update);
    assert.strictEqual(pityDue(0 + update.increment), true);
  });

  test('packs until guaranteed counts the next pack', () => {
    assert.strictEqual(packsUntilPity(0), PITY_THRESHOLD);
    assert.strictEqual(packsUntilPity(PITY_THRESHOLD - 1), 1);
    assert.strictEqual(packsUntilPity(PITY_THRESHOLD + 10), 1);
    assert.strictEqual(packsUntilPity(-4), PITY_THRESHOLD);
  });

  test('simulated streak: Legendary at the latest on pack PITY_THRESHOLD', () => {
    let counter = 0;
    for (let n = 1; n <= PITY_THRESHOLD; n++) {
      const { rarities } = applyPity(['Common', 'Common', 'Common', 'Uncommon', 'Rare'], counter);
      const got = rarities.includes('Legendary');
      if (got) {
        assert.strictEqual(n, PITY_THRESHOLD);
        return;
      }
      const u = pityCounterUpdate(got, false);
      counter = 'set' in u ? u.set : counter + u.increment;
    }
    assert.fail('pity never triggered');
  });
});
