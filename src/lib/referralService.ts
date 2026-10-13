import { randomUUID } from 'node:crypto';
import { addBits } from './bitsLedger';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { Tx, asArray } from './userLock';
import { REFERRAL_BONUS, REFERRAL_CAP, normalizeReferralCode, referrerStillPaid } from './referral';

/**
 * Records who invited a NEW player (called when they pick their username, in
 * the same lock). Ignored for unknown codes, self-referral, or an account that
 * already has a referrer. Returns the referrer's id when attached.
 */
export async function attachReferrer(tx: Tx, userId: string, code: unknown): Promise<string | null> {
  const username = normalizeReferralCode(code);
  if (!username) return null;
  const referrer = await tx.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!referrer || referrer.id === userId) return null;
  const { count } = await tx.user.updateMany({
    where: { id: userId, referredById: null },
    data: { referredById: referrer.id },
  });
  return count === 1 ? referrer.id : null;
}

async function notify(tx: Tx, userId: string, message: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { notifications: true } });
  const notifications = asArray(user?.notifications);
  notifications.push({ id: randomUUID(), type: 'referral_reward', message, actionUrl: '/friends', timestamp: new Date().toISOString(), read: false });
  await tx.user.update({ where: { id: userId }, data: { notifications: notifications as Prisma.InputJsonValue } });
}

/**
 * Pays the referral once the invited player has GitHub connected: both get
 * REFERRAL_BONUS (the referrer only for their first REFERRAL_CAP paid
 * referrals). Safe to call any number of times: the paid flag flips once.
 * Called when GitHub gets linked and right after the referrer is attached.
 */
export async function payReferralIfEligible(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, referredById: true, referralRewardPaid: true },
  });
  if (!user?.referredById || user.referralRewardPaid) return false;
  const github = await prisma.account.findFirst({ where: { userId, provider: 'github' }, select: { id: true } });
  if (!github) return false;

  const referrerId = user.referredById;
  return prisma.$transaction(async (tx) => {
    // Lock both players in a fixed order (two referrals paying at once can't deadlock)
    for (const id of [userId, referrerId].sort()) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    const claimed = await tx.user.updateMany({
      where: { id: userId, referralRewardPaid: false },
      data: { referralRewardPaid: true },
    });
    if (claimed.count === 0) return false;

    const referrer = await tx.user.findUnique({ where: { id: referrerId }, select: { username: true } });
    await addBits(userId, REFERRAL_BONUS, 'referral', { tx, detail: `Invited by ${referrer?.username ?? 'a friend'}` });
    await notify(tx, userId, `Welcome bonus: +${REFERRAL_BONUS} BITS for joining with ${referrer?.username ?? 'a friend'}'s invite.`);

    // Paid referrals before this one (this one already has the flag)
    const paidBefore = (await tx.user.count({ where: { referredById: referrerId, referralRewardPaid: true } })) - 1;
    if (referrerStillPaid(paidBefore)) {
      await addBits(referrerId, REFERRAL_BONUS, 'referral', { tx, detail: `${user.username ?? 'A friend'} joined` });
      await notify(tx, referrerId, `${user.username ?? 'Your friend'} joined with your invite: +${REFERRAL_BONUS} BITS!`);
    }
    return true;
  }, { maxWait: 10_000, timeout: 15_000 });
}

/** Invite stats for the Friends page. */
export async function getReferralStats(userId: string) {
  const [invited, paid] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.user.count({ where: { referredById: userId, referralRewardPaid: true } }),
  ]);
  return { invited, paid, waiting: invited - paid, cap: REFERRAL_CAP, bonus: REFERRAL_BONUS, earned: Math.min(paid, REFERRAL_CAP) * REFERRAL_BONUS };
}

/** Exposed for the GitHub link event (never throws: a failed referral must not break the login). */
export async function payReferralSafe(userId: string) {
  try {
    await payReferralIfEligible(userId);
  } catch (err) {
    console.error('[Referral] Payment failed:', (err as Error).message);
  }
}
