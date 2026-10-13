import { test, describe } from 'node:test';
import assert from 'node:assert';
import { packAtLeastOdds } from './rarity';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

describe('packAtLeastOdds', () => {
  test('standard 5-card booster', () => {
    const odds = packAtLeastOdds({ cardCount: 5 });
    close(odds.Common, 1);
    close(odds.Uncommon, 1); // slot 4 is always Uncommon or better
    close(odds.Rare, 1); // slot 5 is always Rare or better
    close(odds.Epic, 0.45);
    close(odds.Legendary, 0.15);
  });

  test('a guaranteed minimum makes every rarity up to it certain', () => {
    const odds = packAtLeastOdds({ cardCount: 5, guaranteedMinRarity: 'Epic' });
    close(odds.Rare, 1);
    close(odds.Epic, 1);
    close(odds.Legendary, 0.15);
  });

  test('all-Common packs only hold Commons', () => {
    const odds = packAtLeastOdds({ cardCount: 5, allCommon: true });
    assert.deepStrictEqual([odds.Common, odds.Uncommon, odds.Legendary], [1, 0, 0]);
  });
});
