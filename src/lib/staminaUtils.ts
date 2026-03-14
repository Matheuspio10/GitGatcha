export const STAMINA_RECOVERY_RATE_PER_HOUR = 10;
export const MAX_STAMINA = 100;

/**
 * Calculate the current stamina of a card based on its actual stored stamina,
 * the time it has been recovering since last used, and whether it is in the active team.
 */
export function calculateCurrentStamina(
  storedStamina: number,
  lastUsedAt: Date | string,
  inActiveTeam: boolean
): number {
  if (storedStamina >= MAX_STAMINA) return MAX_STAMINA;
  if (inActiveTeam) return storedStamina; // Recovery is paused while in the active team

  const now = new Date();
  const lastUsed = typeof lastUsedAt === 'string' ? new Date(lastUsedAt) : lastUsedAt;
  const hoursSinceLastUsed = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60);
  
  const recoveredStamina = Math.floor(hoursSinceLastUsed * STAMINA_RECOVERY_RATE_PER_HOUR);
  return Math.min(MAX_STAMINA, storedStamina + recoveredStamina);
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
