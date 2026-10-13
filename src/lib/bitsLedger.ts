/**
 * The only way to change a player's BITS: the balance and a BitsTransaction
 * row are written together, so the history always adds up to the balance
 * (audit, support, future payments).
 *
 * Pass `tx` when already inside a transaction (e.g. withUserLock); otherwise
 * the two writes run in their own transaction.
 */
import { prisma } from './prisma';
import type { Tx } from './userLock';
import type { BitsReason } from './bitsReasons';

export type { BitsReason } from './bitsReasons';

interface LedgerOptions {
  tx?: Tx;
  /** Short context shown in the history ("The JavaScript Coven", "Win 2 Battles"…). */
  detail?: string;
}

function inTransaction<T>(tx: Tx | undefined, fn: (db: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction(fn);
}

/** Adds (or, with a negative amount, removes without checking) BITS. Returns the new balance. */
export async function addBits(userId: string, amount: number, reason: BitsReason, options: LedgerOptions = {}): Promise<number | null> {
  if (!Number.isInteger(amount) || amount === 0) return null;
  return inTransaction(options.tx, async (db) => {
    const user = await db.user.update({
      where: { id: userId },
      data: { currency: { increment: amount } },
      select: { currency: true },
    });
    await db.bitsTransaction.create({
      data: { userId, amount, balanceAfter: user.currency, reason, detail: options.detail ?? null },
    });
    return user.currency;
  });
}

/**
 * Spends BITS only if the player has enough, in one conditional update (safe
 * against parallel requests even without the user lock). Returns the new
 * balance, or null when the balance was too low (nothing changed).
 */
export async function spendBits(userId: string, amount: number, reason: BitsReason, options: LedgerOptions = {}): Promise<number | null> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('spendBits needs a positive integer amount');
  return inTransaction(options.tx, async (db) => {
    const rows = await db.$queryRaw<{ currency: number }[]>`
      UPDATE "User" SET "currency" = "currency" - ${amount}, "updatedAt" = NOW()
      WHERE "id" = ${userId} AND "currency" >= ${amount}
      RETURNING "currency"
    `;
    if (rows.length === 0) return null;
    const balance = Number(rows[0].currency);
    await db.bitsTransaction.create({
      data: { userId, amount: -amount, balanceAfter: balance, reason, detail: options.detail ?? null },
    });
    return balance;
  });
}

/** Latest history rows of a player (newest first). */
export function getBitsHistory(userId: string, limit = 50, before?: Date) {
  return prisma.bitsTransaction.findMany({
    where: { userId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, amount: true, balanceAfter: true, reason: true, detail: true, createdAt: true },
  });
}
