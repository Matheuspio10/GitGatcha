import { prisma } from './prisma';
import { calculateCurrentStamina, STAMINA_RECOVERY_RATE_PER_HOUR, MAX_STAMINA, getStaminaMultiplier } from './staminaUtils';

export { STAMINA_RECOVERY_RATE_PER_HOUR, MAX_STAMINA, calculateCurrentStamina, getStaminaMultiplier };

/**
 * Given a user card, returns its calculated current stamina.
 */
export function getCardStamina(userCard: { stamina: number; lastUsedAt: Date; inActiveTeam: boolean }): number {
  return calculateCurrentStamina(userCard.stamina, userCard.lastUsedAt, userCard.inActiveTeam);
}

/**
 * Refreshes a card's stored stamina to its real current value and updates lastUsedAt to now.
 * Useful when doing actions that change its active state or when battling.
 */
export async function syncCardStamina(userCardId: string, currentStaminaValue: number) {
  return await prisma.userCard.update({
    where: { id: userCardId },
    data: {
      stamina: currentStaminaValue,
      lastUsedAt: new Date(),
    }
  });
}

/**
 * Get the stamina multiplier for battling based on stamina value.
 * Stamina Multiplier:
 * 100-81: 1.0 (no penalty)
 * 80-61: 0.9 (-10%)
 * 60-41: 0.75 (-25%)
 * 40-21: 0.60 (-40%)
 * 20-1: 0.40 (-60%)
 * 0: 0 (exhausted, shouldn't really be in battle)
 */
export function getStaminaMultiplier(stamina: number): number {
  if (stamina > 80) return 1.0;
  if (stamina > 60) return 0.90;
  if (stamina > 40) return 0.75;
  if (stamina > 20) return 0.60;
  if (stamina > 0) return 0.40;
  return 0.0;
}
