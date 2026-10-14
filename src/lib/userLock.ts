import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { ApiErrorCode, ErrorValues } from './validation';

export type Tx = Prisma.TransactionClient;

/**
 * Runs `fn` inside a transaction that holds a row lock on the user.
 *
 * Every read-modify-write of a user's currency or JSON columns (inventory,
 * fragments, notifications, pendingRewards…) must go through here, otherwise
 * two parallel requests read the same snapshot and one overwrites the other
 * (duplicated packs, BITS coming back after a purchase, double rewards).
 *
 * Never call the GitHub API (or anything slow) inside `fn`: the lock blocks
 * every other request of the same player until the transaction ends.
 */
export async function withUserLock<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await lockUser(tx, userId);
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/** Takes the row lock on an already-open transaction (re-entrant within the same transaction). */
export async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

/**
 * Thrown inside a locked block to abort the transaction with a message for the
 * client. `code` is a key of messages/<locale>/apiErrors.json; the route answers
 * it in the player's language (`routeError` in apiResponse.ts).
 */
export class UserFacingError extends Error {
  constructor(public code: ApiErrorCode, public status = 400, public values?: ErrorValues) {
    super(code);
  }
}

export function asRecord(value: unknown): Record<string, number> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, number>) } : {};
}

export function asArray<T = Prisma.JsonValue>(value: unknown): T[] {
  return Array.isArray(value) ? [...(value as T[])] : [];
}
