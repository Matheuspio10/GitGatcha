import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rerollDailyMission } from '@/lib/economyService';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const required = { error: 'missions.missionIdRequired' } as const;
const bodySchema = z.object({ userMissionId: z.string(required).trim().min(1, required).max(100, required) }, required);

/** Swaps one unfinished daily mission for another (once per UTC day). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { userMissionId } = body.data;
  try {
    const mission = await rerollDailyMission(userId, userMissionId);
    return NextResponse.json({ success: true, mission });
  } catch (err) {
    return routeError(err, 'missions.swapFailed', 'Mission reroll error');
  }
}
