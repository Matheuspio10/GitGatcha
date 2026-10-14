import { NextResponse } from 'next/server';
import { getSerializablePacks, PACK_CATEGORIES, storePacks } from '@/lib/packDefinitions';
import { sprintPeriod } from '@/lib/sprints';

// The weekly event pack changes every Monday
export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  return NextResponse.json({
    packs: getSerializablePacks(storePacks(now)),
    categories: PACK_CATEGORIES,
    // Measured on the server, so the countdown works even when the device clock is off
    eventEndsInMs: sprintPeriod('weekly', now).endsAt.getTime() - now.getTime(),
  });
}
