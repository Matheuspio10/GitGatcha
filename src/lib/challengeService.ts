/**
 * Friend challenge housekeeping: stakes (escrowed BITS), expiry, cancelling
 * and open (link) challenges. Every BITS move goes through the ledger.
 */
import { prisma } from './prisma';
import { addBits, spendBits } from './bitsLedger';
import { UserFacingError } from './userLock';
import { CHALLENGE_STAKE_MAX } from './battleConfig';

/** A valid stake (integer, 0..CHALLENGE_STAKE_MAX); anything else is an error for the player. */
export function parseStake(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const stake = Number(value);
  if (!Number.isInteger(stake) || stake < 0 || stake > CHALLENGE_STAKE_MAX) {
    throw new UserFacingError(`The stake must be a whole number from 0 to ${CHALLENGE_STAKE_MAX} BITS`);
  }
  return stake;
}

/** Whether two players are accepted friends (direct challenges are friends-only). */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const friendship = await prisma.friendship.findFirst({
    where: { status: 'ACCEPTED', OR: [{ userId: a, friendId: b }, { userId: b, friendId: a }] },
    select: { id: true },
  });
  return !!friendship;
}

/** Ends a pending challenge (expired / cancelled) once, giving the challenger's stake back. */
async function closePending(battleId: string, status: 'EXPIRED' | 'CANCELLED', reason: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const battle = await tx.battle.findUnique({ where: { id: battleId }, select: { challengerId: true, stake: true } });
    if (!battle) return false;
    const { count } = await tx.battle.updateMany({ where: { id: battleId, status: 'PENDING' }, data: { status } });
    if (count === 0) return false;
    if (battle.stake > 0) await addBits(battle.challengerId, battle.stake, 'challenge_refund', { tx, detail: reason });
    return true;
  });
}

/** Expires every pending challenge past its deadline (refunding stakes). */
export async function expireChallenges(now = new Date()): Promise<number> {
  const due = await prisma.battle.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: { id: true },
  });
  let expired = 0;
  for (const b of due) if (await closePending(b.id, 'EXPIRED', 'Challenge expired')) expired++;
  return expired;
}

/** The challenger withdraws a pending challenge (stake back). */
export async function cancelChallenge(battleId: string, userId: string) {
  const battle = await prisma.battle.findUnique({ where: { id: battleId }, select: { challengerId: true, status: true } });
  if (!battle || battle.challengerId !== userId) throw new UserFacingError('Challenge not found', 404);
  if (battle.status !== 'PENDING') throw new UserFacingError('This challenge was already answered or closed');
  if (!(await closePending(battleId, 'CANCELLED', 'Challenge cancelled'))) throw new UserFacingError('This challenge was already answered or closed');
}

/**
 * The defender joins: claims an open (link) challenge if needed and puts in
 * the same stake. Undone by `releaseDefender` if the battle then fails.
 */
export async function joinChallenge(battleId: string, userId: string) {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    select: { challengerId: true, defenderId: true, isOpen: true, stake: true, status: true },
  });
  if (!battle || battle.status !== 'PENDING') throw new UserFacingError('This challenge is no longer open', 400);
  if (battle.challengerId === userId) throw new UserFacingError('You cannot accept your own challenge');

  let claimed = false;
  if (battle.defenderId !== userId) {
    if (!battle.isOpen || battle.defenderId) throw new UserFacingError('You are not the defender of this battle', 403);
    const { count } = await prisma.battle.updateMany({
      where: { id: battleId, status: 'PENDING', defenderId: null },
      data: { defenderId: userId },
    });
    if (count === 0) throw new UserFacingError('Someone else accepted this challenge first', 409);
    claimed = true;
  }

  if (battle.stake > 0) {
    const paid = await spendBits(userId, battle.stake, 'challenge_stake', { detail: 'Accepted a challenge' });
    if (paid === null) {
      if (claimed) await prisma.battle.updateMany({ where: { id: battleId, defenderId: userId, status: 'PENDING' }, data: { defenderId: null } });
      throw new UserFacingError(`You need ${battle.stake} BITS to match the stake`);
    }
  }
  return { stake: battle.stake, claimed };
}

/** Gives the defender's stake back (and frees an open challenge) when the battle could not be resolved. */
export async function releaseDefender(battleId: string, userId: string, joined: { stake: number; claimed: boolean }) {
  if (joined.stake > 0) await addBits(userId, joined.stake, 'challenge_refund', { detail: 'Challenge could not be resolved' });
  if (joined.claimed) await prisma.battle.updateMany({ where: { id: battleId, defenderId: userId, status: 'PENDING' }, data: { defenderId: null } });
}
