import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { withUserLock } from '@/lib/userLock';
import { recordGuestCards, startOnboarding } from '@/lib/onboardingService';
import { cookies } from 'next/headers';
import { GUEST_COOKIE, claimGuestPull } from '@/lib/guestPack';
import { REFERRAL_COOKIE } from '@/lib/referral';
import { attachReferrer, payReferralSafe } from '@/lib/referralService';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;

// The setup form sends the username and, optionally, the invite code typed in.
// An unusable invite code is ignored (as attachReferrer does with unknown ones).
const bodySchema = z.object({
  username: z
    .string({ error: 'user.usernameLength' })
    .min(USERNAME_MIN, { error: 'user.usernameLength' })
    .max(USERNAME_MAX, { error: 'user.usernameLength' })
    .regex(/^[a-zA-Z0-9_]+$/, { error: 'user.usernameChars' }),
  referralCode: z.string().max(100).optional().catch(undefined),
}, { error: 'user.usernameLength' });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    if (!userId) {
      return apiError('common.unauthorized', 401);
    }

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { username, referralCode } = body.data;

    // Taken by ANOTHER player (case-insensitive). The player's own name doesn't count:
    // the setup form comes pre-filled with the name generated at sign-up.
    const taken = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' }, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) {
      return apiError('user.usernameTaken', 409);
    }

    // Save the username; the first time, the player also gets the starter pack
    // and the "Getting started" checklist
    const starterPack = await withUserLock(userId, async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: { hasSetupProfile: true } });
      await tx.user.update({
        select: { id: true },
        where: { id: userId },
        data: { username: username, hasSetupProfile: true }
      });
      if (before?.hasSetupProfile !== false) return false;
      // New player: remember who invited them (code typed in the form, or the invite link's cookie)
      await attachReferrer(tx, userId, referralCode || (await cookies()).get(REFERRAL_COOKIE)?.value);
      return startOnboarding(tx, userId);
    });

    // A visitor's free pack (opened on /try before signing up) joins the new account
    let guestCards = 0;
    if (starterPack) {
      const cookieStore = await cookies();
      guestCards = await claimGuestPull(userId, cookieStore.get(GUEST_COOKIE)?.value);
      cookieStore.delete(GUEST_COOKIE);
      if (guestCards > 0) await recordGuestCards(userId, guestCards);
      cookieStore.delete(REFERRAL_COOKIE);
      // Signed up with GitHub: the referral can be paid right away
      await payReferralSafe(userId);
    }

    return NextResponse.json({ success: true, username, starterPack, guestCards });
  } catch (error) {
    return routeError(error, 'user.setupFailed', 'Error setting username');
  }
}
