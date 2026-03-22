import test from 'node:test';
import assert from 'node:assert';
import { getLoyaltyBonuses } from './loyaltyService';

test('getLoyaltyBonuses - fallback for invalid tier', () => {
  const result = getLoyaltyBonuses('invalid_tier');
  assert.deepStrictEqual(result, { atkMult: 1, defMult: 1, hpMult: 1 });
});

test('getLoyaltyBonuses - veteran tier', () => {
  const result = getLoyaltyBonuses('veteran');
  assert.deepStrictEqual(result, { atkMult: 1.03, defMult: 1.03, hpMult: 1 });
});

test('getLoyaltyBonuses - trusted tier', () => {
  const result = getLoyaltyBonuses('trusted');
  assert.deepStrictEqual(result, { atkMult: 1.07, defMult: 1.07, hpMult: 1 });
});

test('getLoyaltyBonuses - reliable tier', () => {
  const result = getLoyaltyBonuses('reliable');
  assert.deepStrictEqual(result, { atkMult: 1.12, defMult: 1.12, hpMult: 1 });
});

test('getLoyaltyBonuses - legendary_bond tier', () => {
  const result = getLoyaltyBonuses('legendary_bond');
  assert.deepStrictEqual(result, { atkMult: 1.18, defMult: 1.18, hpMult: 1.05 });
});

test('getLoyaltyBonuses - eternal tier', () => {
  const result = getLoyaltyBonuses('eternal');
  assert.deepStrictEqual(result, { atkMult: 1.25, defMult: 1.25, hpMult: 1.10 });
});
