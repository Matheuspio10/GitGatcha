import type { Rarity } from './rarity';

/**
 * Card gifts between friends: the rules and numbers (client-safe; the wiki and
 * the gift dialog read them from here). The transfer itself is giftService.ts.
 *
 * A gift MOVES the card: the player owns each developer once (extra pulls are
 * already fragments), so the sender gives their only copy away.
 */

/** BITS the sender pays per gift, by rarity. They leave the game (no one receives them). */
export const GIFT_FEE: Record<Rarity, number> = {
  Common: 25,
  Uncommon: 60,
  Rare: 150,
  Epic: 400,
  Legendary: 1000,
};

/** Level the sender needs: fresh accounts can't funnel their starter cards to a main account. */
export const GIFT_MIN_LEVEL = 5;
/** Gifts per player per UTC day. */
export const GIFT_DAILY_SEND_LIMIT = 3;
export const GIFT_DAILY_RECEIVE_LIMIT = 3;

export function giftFee(rarity: string): number {
  return GIFT_FEE[rarity as Rarity] ?? GIFT_FEE.Common;
}

/** Why a card can't be given right now (a key of apiErrors.gifts), or null. */
export type GiftBlock = 'signature' | 'activeTeam' | 'pendingChallenge' | 'level' | 'dailySendLimit';

export function giftBlock(
  card: { edition: string; inActiveTeam: boolean; inPendingChallenge: boolean },
  sender: { level: number; sentToday: number },
): GiftBlock | null {
  // The Signature is the player's own GitHub profile: it never changes hands
  if (card.edition === 'signature') return 'signature';
  if (sender.level < GIFT_MIN_LEVEL) return 'level';
  // The saved Ranked team and open challenges point at this copy
  if (card.inActiveTeam) return 'activeTeam';
  if (card.inPendingChallenge) return 'pendingChallenge';
  if (sender.sentToday >= GIFT_DAILY_SEND_LIMIT) return 'dailySendLimit';
  return null;
}

/** Midnight UTC of `now`'s day: the daily limits reset then. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The friend's new copy. The developer and its Shiny travel; so do stamina and
 * its clock (gifting doesn't heal a tired card). Training, loyalty, lifetime
 * stats and the showcase belong to the old owner and start over.
 */
export function giftedCopy(card: { cardId: string; isShiny: boolean; stamina: number; lastUsedAt: Date }, receiverId: string) {
  return {
    userId: receiverId,
    cardId: card.cardId,
    isShiny: card.isShiny,
    stamina: card.stamina,
    lastUsedAt: card.lastUsedAt,
  };
}
