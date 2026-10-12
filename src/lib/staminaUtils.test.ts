import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCurrentStamina, MAX_STAMINA, STAMINA_RECOVERY_RATE_PER_HOUR } from './staminaUtils';

describe('calculateCurrentStamina', () => {
  test('returns MAX_STAMINA if storedStamina is already >= MAX_STAMINA', () => {
    assert.strictEqual(calculateCurrentStamina(MAX_STAMINA, new Date(), false), MAX_STAMINA);
    assert.strictEqual(calculateCurrentStamina(MAX_STAMINA + 10, new Date(), false), MAX_STAMINA);
  });

  test('returns storedStamina with no recovery if the card is in the active team', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    // Even though 2 hours have passed, it shouldn't recover because inActiveTeam is true
    assert.strictEqual(calculateCurrentStamina(50, twoHoursAgo, true), 50);
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
