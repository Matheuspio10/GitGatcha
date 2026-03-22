import { NextResponse } from 'next/server';
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

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Starting fallback pool rebuild...');
    const results = await rebuildFallbackPools();
    console.log('[Cron] Fallback pool rebuild complete:', results);

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
