import test from 'node:test';
import assert from 'node:assert';
import { getStaminaMultiplier } from './staminaUtils.ts';

test('getStaminaMultiplier', async (t) => {
  await t.test('returns 1.0 when stamina is > 80', () => {
    assert.strictEqual(getStaminaMultiplier(81), 1.0);
    assert.strictEqual(getStaminaMultiplier(100), 1.0);
  });

  await t.test('returns 0.90 when stamina is > 60 and <= 80', () => {
    assert.strictEqual(getStaminaMultiplier(61), 0.90);
    assert.strictEqual(getStaminaMultiplier(80), 0.90);
  });

  await t.test('returns 0.75 when stamina is > 40 and <= 60', () => {
    assert.strictEqual(getStaminaMultiplier(41), 0.75);
    assert.strictEqual(getStaminaMultiplier(60), 0.75);
  });

  await t.test('returns 0.60 when stamina is > 20 and <= 40', () => {
    assert.strictEqual(getStaminaMultiplier(21), 0.60);
    assert.strictEqual(getStaminaMultiplier(40), 0.60);
  });

  await t.test('returns 0.40 when stamina is > 0 and <= 20', () => {
    assert.strictEqual(getStaminaMultiplier(1), 0.40);
    assert.strictEqual(getStaminaMultiplier(20), 0.40);
  });

  await t.test('returns 0.0 when stamina is <= 0', () => {
    assert.strictEqual(getStaminaMultiplier(0), 0.0);
    assert.strictEqual(getStaminaMultiplier(-10), 0.0);
  });
});
