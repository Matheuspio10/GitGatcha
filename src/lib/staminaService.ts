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

