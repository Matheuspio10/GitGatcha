import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCurrentStamina, staminaAfterBattle, MAX_STAMINA, STAMINA_RECOVERY_RATE_PER_HOUR } from './staminaUtils';

describe('calculateCurrentStamina', () => {
  test('returns MAX_STAMINA if storedStamina is already >= MAX_STAMINA', () => {
    assert.strictEqual(calculateCurrentStamina(MAX_STAMINA, new Date(), false), MAX_STAMINA);
    assert.strictEqual(calculateCurrentStamina(MAX_STAMINA + 10, new Date(), false), MAX_STAMINA);
  });

  test('cards in the active team recover like any other card', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const expected = 50 + 2 * STAMINA_RECOVERY_RATE_PER_HOUR;
    assert.strictEqual(calculateCurrentStamina(50, twoHoursAgo, true), expected);
    assert.strictEqual(calculateCurrentStamina(50, twoHoursAgo, false), expected);
  });

  test('never goes below 0 and ignores lastUsedAt in the future', () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    assert.strictEqual(calculateCurrentStamina(30, inOneHour, false), 30);
    assert.strictEqual(calculateCurrentStamina(-20, new Date(), false), 0);
  });

  test('recovers stamina correctly based on hours elapsed using a Date object', () => {
    const hoursElapsed = 3;
    const pastDate = new Date(Date.now() - hoursElapsed * 60 * 60 * 1000);
    const expectedStamina = 50 + hoursElapsed * STAMINA_RECOVERY_RATE_PER_HOUR;
    assert.strictEqual(calculateCurrentStamina(50, pastDate, false), expectedStamina);
  });

  test('recovers stamina correctly based on hours elapsed using an ISO string', () => {
    const hoursElapsed = 4;
    const pastDateStr = new Date(Date.now() - hoursElapsed * 60 * 60 * 1000).toISOString();
    const expectedStamina = 20 + hoursElapsed * STAMINA_RECOVERY_RATE_PER_HOUR;
    assert.strictEqual(calculateCurrentStamina(20, pastDateStr, false), expectedStamina);
  });

  test('caps total stamina at MAX_STAMINA even if time elapsed would exceed it', () => {
    // 24 hours elapsed would normally recover 240 stamina
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    assert.strictEqual(calculateCurrentStamina(50, twentyFourHoursAgo, false), MAX_STAMINA);
  });

  test('verifies stamina is correctly rounded down for partial hours', () => {
    // 2.5 hours recovers 25 stamina (2.5 * 10)
    const twoAndHalfHoursAgo = new Date(Date.now() - 2.5 * 60 * 60 * 1000);
    const expectedStamina = 50 + 25; // 75
    assert.strictEqual(calculateCurrentStamina(50, twoAndHalfHoursAgo, false), expectedStamina);

    // 2.55 hours recovers 25 stamina (Math.floor(2.55 * 10) = 25)
    const twoPointFiveFiveHoursAgo = new Date(Date.now() - 2.55 * 60 * 60 * 1000);
    const expectedStamina2 = 50 + 25; // 75
    assert.strictEqual(calculateCurrentStamina(50, twoPointFiveFiveHoursAgo, false), expectedStamina2);
  });
});

describe('staminaAfterBattle', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  test('spends from the recovered value, not the stored one', () => {
    // stored 40, 3h of rest -> 70 current -> 50 after a 20-stamina battle
    assert.strictEqual(staminaAfterBattle(40, hoursAgo(3), 20, now), 50);
  });

  test('does not restore stamina spent after a snapshot was taken', () => {
    // A challenge snapshot said 100, but the card fought meanwhile and is at 30 now
    assert.strictEqual(staminaAfterBattle(30, now, 20, now), 10);
  });

  test('floors at 0', () => {
    assert.strictEqual(staminaAfterBattle(10, now, 20, now), 0);
    assert.strictEqual(staminaAfterBattle(0, now, 20, now), 0);
  });

  test('caps the recovered value at MAX_STAMINA before spending', () => {
    assert.strictEqual(staminaAfterBattle(90, hoursAgo(48), 20, now), MAX_STAMINA - 20);
  });
});
