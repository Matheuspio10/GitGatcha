import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { rebuildFallbackPools } from '@/lib/fallbackPoolService';

export const maxDuration = 60;

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
    const results = await rebuildFallbackPools();

    return NextResponse.json({
      success: true,
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
