import { GIFT_MIN_LEVEL, giftFee } from './gifts';

/**
 * Card trades between friends: the rules and numbers (client-safe; the wiki,
 * the trade builder and tradeService.ts read them from here).
 *
 * A trade is a swap of copies: each side gives some of its cards and gets some
 * of the other's, under the same rules as a gift (gifts.ts): the Signature,
 * active-team and open-challenge cards can't change hands, the Shiny and
 * stamina travel, training and loyalty start over.
 */

/** Cards each side may put in one trade. */
export const TRADE_MAX_CARDS = 3;
/** A proposal nobody answered closes after this long. */
export const TRADE_EXPIRY_HOURS = 72;
/** Open proposals a player may have sent at once. */
export const TRADE_MAX_PENDING = 5;
/** Accepted trades per player per UTC day. */
export const TRADE_DAILY_LIMIT = 3;
/** Both players need it (each one gives cards away). The same level as gifts. */
export const TRADE_MIN_LEVEL = GIFT_MIN_LEVEL;

export const TRADE_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

/**
 * What one side pays for the cards it gives: the gift fee of each card (so a
 * one-sided "trade" costs exactly what the gift would). The BITS leave the game.
 */
export function tradeFee(rarities: string[]): number {
  return rarities.reduce((sum, rarity) => sum + giftFee(rarity), 0);
}

/** Why a proposal's card lists are not a valid trade (a key of apiErrors.trades), or null. */
export type TradeShapeError = 'emptySide' | 'tooManyCards' | 'duplicateCard';

export function tradeShapeError(offered: string[], requested: string[]): TradeShapeError | null {
  // A trade has cards on both sides; giving without getting is a gift
  if (offered.length === 0 || requested.length === 0) return 'emptySide';
  if (offered.length > TRADE_MAX_CARDS || requested.length > TRADE_MAX_CARDS) return 'tooManyCards';
  const all = [...offered, ...requested];
  if (new Set(all).size !== all.length) return 'duplicateCard';
  return null;
}

export function tradeExpiry(now: Date): Date {
  return new Date(now.getTime() + TRADE_EXPIRY_HOURS * 60 * 60 * 1000);
}

/** A pending proposal past its expiry counts as expired, whether or not the row was updated yet. */
export function effectiveStatus(trade: { status: string; expiresAt: Date }, now: Date): string {
  return trade.status === 'PENDING' && trade.expiresAt <= now ? 'EXPIRED' : trade.status;
}
