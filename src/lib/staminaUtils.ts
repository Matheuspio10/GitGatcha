export const STAMINA_RECOVERY_RATE_PER_HOUR = 10;
export const MAX_STAMINA = 100;

/**
 * Calculate the current stamina of a card from its stored stamina and the time
 * it has been recovering since it was last used.
 *
 * Every card recovers over time, including the ones in the saved team: the
 * team builder remembers the last team picked, so freezing those cards forced
 * players to pay for stamina. `_inActiveTeam` is kept only so existing callers
 * keep compiling; it no longer changes the result.
 */
export function calculateCurrentStamina(
  storedStamina: number,
  lastUsedAt: Date | string,
  _inActiveTeam: boolean = false,
  now: Date = new Date()
): number {
  if (storedStamina >= MAX_STAMINA) return MAX_STAMINA;
  const base = Math.max(0, storedStamina);

  const lastUsed = typeof lastUsedAt === 'string' ? new Date(lastUsedAt) : lastUsedAt;
  const hoursSinceLastUsed = Math.max(0, (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60));

  const recoveredStamina = Math.floor(hoursSinceLastUsed * STAMINA_RECOVERY_RATE_PER_HOUR);
  return Math.min(MAX_STAMINA, base + recoveredStamina);
}

/**
 * Stamina left after spending `cost`, starting from the card's *current*
 * (recovered) stamina. Never negative.
 */
export function staminaAfterBattle(
  storedStamina: number,
  lastUsedAt: Date | string,
  cost: number,
  now: Date = new Date()
): number {
  return Math.max(0, calculateCurrentStamina(storedStamina, lastUsedAt, false, now) - cost);
}

/**
 * Get the stamina multiplier for battling based on stamina value.
 */
export function getStaminaMultiplier(stamina: number): number {
  if (stamina > 80) return 1.0;
  if (stamina > 60) return 0.90;
  if (stamina > 40) return 0.75;
  if (stamina > 20) return 0.60;
  if (stamina > 0) return 0.40;
  return 0.0;
}
