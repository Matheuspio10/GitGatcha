import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiError, routeError } from '@/lib/apiResponse';
import { getFriendsFeed } from '@/lib/activityFeedService';

/** The friends' activity feed (see src/lib/activityFeed.ts). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  try {
    return NextResponse.json({ events: await getFriendsFeed(userId) });
  } catch (err) {
    return routeError(err, 'friends.feedFailed', 'Feed error');
  }
}
