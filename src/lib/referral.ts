/**
 * Referrals (pure, client-safe). The invite code is the player's username,
 * shared as a link (`/try?ref=<username>`). Both players get REFERRAL_BONUS
 * once the new player connects GitHub (e-mail accounts are cheap to farm, a
 * GitHub account linked to only one player is not). A player is paid for at
 * most REFERRAL_CAP referrals; the invited player is always paid.
 */

export const REFERRAL_BONUS = 200;
export const REFERRAL_CAP = 10;
/** Cookie that remembers the invite code between the link and the sign-up. */
export const REFERRAL_COOKIE = 'gg_ref';

/** A usable invite code (a username shape), or null. */
export function normalizeReferralCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().replace(/^@/, '');
  return /^[a-zA-Z0-9_-]{3,40}$/.test(trimmed) ? trimmed : null;
}

/** Whether the referrer still gets paid for one more referral (counting the ones already paid). */
export function referrerStillPaid(alreadyPaid: number): boolean {
  return alreadyPaid < REFERRAL_CAP;
}

export function inviteLink(origin: string, username: string): string {
  return `${origin}/try?ref=${encodeURIComponent(username)}`;
}
