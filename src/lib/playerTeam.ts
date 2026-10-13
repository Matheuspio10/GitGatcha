import { prisma } from './prisma';
import { getCardStamina } from './staminaService';
import { UserFacingError } from './userLock';

/**
 * The player's 3-card team in the chosen order, checked: exactly 3 cards, all
 * owned, none exhausted. Each card's `id` is its UserCard id (stamina and
 * loyalty are tracked per UserCard).
 */
export async function loadPlayerTeam(userId: string, cardIds: unknown) {
  if (!Array.isArray(cardIds) || cardIds.length !== 3 || cardIds.some(id => typeof id !== 'string')) {
    throw new UserFacingError('You must select exactly 3 cards for your team');
  }
  if (new Set(cardIds).size !== 3) throw new UserFacingError('You cannot use the same card twice in a team');

  const userCards = await prisma.userCard.findMany({
    where: { userId, cardId: { in: cardIds as string[] } },
    include: { card: true },
  });

  return (cardIds as string[]).map(id => {
    const uc = userCards.find(u => u.cardId === id);
    if (!uc) throw new UserFacingError('One or more cards not found in your collection', 404);
    const stamina = getCardStamina(uc);
    if (stamina === 0) throw new UserFacingError(`Card ${uc.card.name} is exhausted and cannot battle`);
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
    };
  });
}

export type PlayerTeamCard = Awaited<ReturnType<typeof loadPlayerTeam>>[number];
