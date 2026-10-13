import { after, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/session';
import { enforceRateLimit, rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { refillBoosterReserve } from '@/lib/boosterService';
import { GUEST_COOKIE, GUEST_PACK_ID, GUEST_PULL_TTL_DAYS, drawGuestPack, getGuestPull } from '@/lib/guestPack';

// Covers a live draw on GitHub plus the reserve refill after the response
export const maxDuration = 120;

/** The visitor's free pack waiting for a sign-up, if any. */
export async function GET() {
  const pull = await getGuestPull((await cookies()).get(GUEST_COOKIE)?.value);
  return NextResponse.json({ pull });
}

/** Opens the free pack: once per visitor (cookie), a few per IP a day, and a global cap on GitHub calls. */
export async function POST(req: Request) {
  try {
    if (await getCurrentUser()) {
      return NextResponse.json({ error: 'The free pack is for visitors. Your boosters are in the inventory.' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const existing = await getGuestPull(cookieStore.get(GUEST_COOKIE)?.value);
    if (existing) return NextResponse.json({ pull: existing, alreadyOpened: true });

    const limited = await enforceRateLimit(req, 'guest-pack', 3, 24 * 60 * 60);
    if (limited) return limited;
    const global = await rateLimit('guest-pack:global', 120, 60 * 60);
    if (!global.ok) return tooManyRequests(global.retryAfter);

    const pull = await drawGuestPack();
    cookieStore.set(GUEST_COOKIE, pull.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_PULL_TTL_DAYS * 24 * 60 * 60,
    });

    after(() => refillBoosterReserve(null, GUEST_PACK_ID));
    return NextResponse.json({ pull, alreadyOpened: false });
  } catch (error) {
    console.error('Guest pack error:', error);
    return NextResponse.json({ error: 'Could not open the pack right now. Try again in a few minutes.' }, { status: 503 });
  }
}
