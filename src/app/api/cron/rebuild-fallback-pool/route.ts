import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { rebuildFallbackPools } from '@/lib/fallbackPoolService';

/**
 * Cron endpoint to rebuild the fallback developer pool for language boosters.
 * Intended to be called every 48 hours by a cron scheduler (e.g., Vercel Cron).
 * 
 * Protected by CRON_SECRET environment variable.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
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
      pools: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Fallback pool rebuild failed:', error);
    return NextResponse.json({ error: 'Rebuild failed' }, { status: 500 });
  }
}

// Allow POST as well for manual triggers
export { GET as POST };
