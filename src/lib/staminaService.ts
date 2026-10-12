import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { calculateCurrentStamina, staminaAfterBattle, STAMINA_RECOVERY_RATE_PER_HOUR, MAX_STAMINA, getStaminaMultiplier } from './staminaUtils';
import { STAMINA_COST_PER_BATTLE } from './battleConfig';

export { STAMINA_RECOVERY_RATE_PER_HOUR, MAX_STAMINA, calculateCurrentStamina, getStaminaMultiplier };

/**
 * Given a user card, returns its calculated current stamina.
 */
export function getCardStamina(userCard: { stamina: number; lastUsedAt: Date; inActiveTeam?: boolean }): number {
  return calculateCurrentStamina(userCard.stamina, userCard.lastUsedAt);
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
 * Spends battle stamina from the given user cards.
 *
 * Reads each card's *current* value under a row lock and writes
 * max(0, current − cost): parallel battles can't both start from the same
 * value, and an old snapshot (e.g. a challenge team saved hours ago) can never
 * restore stamina spent in the meantime. A card listed twice pays twice.
 */
export async function spendCardStamina(userCardIds: string[], costPerBattle: number = STAMINA_COST_PER_BATTLE) {
  const uses = new Map<string, number>();
  for (const id of userCardIds) uses.set(id, (uses.get(id) || 0) + 1);
  const ids = Array.from(uses.keys());
  if (ids.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserCard" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
    const cards = await tx.userCard.findMany({
      where: { id: { in: ids } },
      select: { id: true, stamina: true, lastUsedAt: true },
    });
    const now = new Date();
    for (const card of cards) {
      const cost = costPerBattle * (uses.get(card.id) || 1);
      await tx.userCard.update({
        where: { id: card.id },
        data: { stamina: staminaAfterBattle(card.stamina, card.lastUsedAt, cost, now), lastUsedAt: now },
      });
    }
  });
}
