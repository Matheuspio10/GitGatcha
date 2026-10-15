import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { rebuildFallbackPools } from '@/lib/fallbackPoolService';
import { closeDueSeasons } from '@/lib/seasonService';
import { maintainSprints } from '@/lib/sprintService';
import { getFeaturedDevLogin } from '@/lib/weeklyEventService';
import { refreshLivingCards } from '@/lib/livingCardService';
import { LIVING_CARD_CRON_BATCH } from '@/lib/livingCards';

// Fluid compute: up to 300 s on Hobby (the job stops itself at ~270 s and resumes next run)
export const maxDuration = 300;

/**
 * Daily maintenance of the booster sampler (see fallbackPoolService.ts),
 * scheduled in vercel.json. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Without a secret the endpoint would let anyone burn the GitHub quota: refuse to run
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }

  {
    const expectedAuth = `Bearer ${cronSecret}`;
    const providedAuth = authHeader || '';

    // Create hashes to ensure constant time comparison even if lengths differ
    const expectedBuffer = crypto.createHash('sha256').update(expectedAuth).digest();
    const providedBuffer = crypto.createHash('sha256').update(providedAuth).digest();

    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Ranked seasons close here too, in case nobody played or opened the rankings
    const seasonsClosed = await closeDueSeasons().catch((err: unknown) => {
      console.error('[Cron] Season close failed:', err);
      return 0;
    });
    // Sprints too: pays the ones that ended and opens today's (and this week's)
    const sprintsClosed = await maintainSprints().catch((err: unknown) => {
      console.error('[Cron] Sprint close failed:', err);
      return 0;
    });
    // Draws the Dev of the Week on the week's first run (otherwise the first visit does)
    await getFeaturedDevLogin().catch((err: unknown) => console.error('[Cron] Dev of the Week failed:', err));
    // Living cards: a batch every day even without traffic (never throws)
    const livingCards = await refreshLivingCards({ batch: LIVING_CARD_CRON_BATCH, useSlot: false });
    const results = await rebuildFallbackPools();

    return NextResponse.json({
      success: true,
      seasonsClosed,
      sprintsClosed,
      livingCards: livingCards && { refreshed: livingCards.refreshed, changed: livingCards.changed.length, missing: livingCards.missing.length },
      report: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Fallback pool rebuild failed:', error);
    return NextResponse.json({ error: 'Rebuild failed' }, { status: 500 });
  }
}

// Allow POST as well for manual triggers
export { GET as POST };
