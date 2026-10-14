import { z } from 'zod';
import { prisma } from './prisma';
import { getCardStamina } from './staminaService';
import { UserFacingError } from './userLock';

/** The `cardIds` of a 3-card team as the battle screens send it (global card ids, in order). */
export const teamCardIdsSchema = z
  .array(z.string({ error: 'team.exactlyThree' }).trim().min(1, { error: 'team.exactlyThree' }).max(100, { error: 'team.exactlyThree' }), { error: 'team.exactlyThree' })
  .length(3, { error: 'team.exactlyThree' });

/**
 * The player's 3-card team in the chosen order, checked: exactly 3 cards, all
 * owned, none exhausted. Each card's `id` is its UserCard id (stamina and
 * loyalty are tracked per UserCard).
 */
export async function loadPlayerTeam(userId: string, cardIds: string[]) {
  if (cardIds.length !== 3) throw new UserFacingError('team.exactlyThree');
  if (new Set(cardIds).size !== 3) throw new UserFacingError('team.duplicateCard');

  const userCards = await prisma.userCard.findMany({
    where: { userId, cardId: { in: cardIds } },
    include: { card: true },
  });

  return cardIds.map(id => {
    const uc = userCards.find(u => u.cardId === id);
    if (!uc) throw new UserFacingError('team.cardsNotOwned', 404);
    const stamina = getCardStamina(uc);
    if (stamina === 0) throw new UserFacingError('team.cardExhausted', 400, { name: uc.card.name });
    return {
      id: uc.id,
      cardId: uc.cardId,
      name: uc.card.name,
      atk: uc.card.atk,
      def: uc.card.def,
      hp: uc.card.hp,
      stamina,
      rarity: uc.card.rarity,
      primaryLanguage: uc.card.primaryLanguage,
      avatarUrl: uc.card.avatarUrl,
      loyaltyTier: uc.loyaltyTier || 'none',
      trainingLevel: uc.trainingLevel,
    };
  });
}

export type PlayerTeamCard = Awaited<ReturnType<typeof loadPlayerTeam>>[number];
