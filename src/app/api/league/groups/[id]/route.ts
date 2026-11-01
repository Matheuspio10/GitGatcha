import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { enforceRateLimit } from '@/lib/rateLimit';
import { idSchema } from '@/lib/validation';
import { leaveGroup, removeMember, resetGroupCode } from '@/lib/leagueGroupService';

const bodySchema = z.object({
  action: z.enum(['leave', 'remove', 'resetCode']).optional(),
  userId: idSchema.optional(),
}).optional();

/** POST { action }: leave (any member); remove { userId } or resetCode (the owner). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'league-group-manage', 20, 60, userId);
  if (limited) return limited;

  const { id } = await params;
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const action = body.data?.action;
  if (!action) return apiError('leagueGroups.actionRequired');

  try {
    if (action === 'leave') return NextResponse.json({ success: true, ...await leaveGroup(userId, id) });
    if (action === 'resetCode') return NextResponse.json({ success: true, ...await resetGroupCode(userId, id) });
    if (!body.data?.userId) return apiError('leagueGroups.memberRequired');
    return NextResponse.json({ success: true, ...await removeMember(userId, id, body.data.userId) });
  } catch (err) {
    return routeError(err, 'leagueGroups.failed', 'League group action error');
  }
}
