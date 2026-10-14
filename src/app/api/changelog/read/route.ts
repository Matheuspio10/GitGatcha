import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiError, readBody } from '@/lib/apiResponse';
import { idSchema } from '@/lib/validation';
import { z } from 'zod';

// The changelog modal sends the ids of the entries it has just shown
const bodySchema = z.object({
  entryIds: z.array(idSchema, { error: 'changelog.invalidInput' }).max(1000, { error: 'changelog.invalidInput' }),
}, { error: 'changelog.invalidInput' });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { entryIds } = body.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { seenChangelogs: true },
    });

    if (!user) return apiError('common.userNotFound', 404);

    const currentSeen = Array.isArray(user.seenChangelogs) ? (user.seenChangelogs as string[]) : [];
    
    // Add only new ids
    const newSeen = Array.from(new Set([...currentSeen, ...entryIds]));

    await prisma.user.update({
      select: { id: true },
      where: { id: userId },
      data: {
        seenChangelogs: newSeen,
      },
    });

    return NextResponse.json({ success: true, seenChangelogs: newSeen });
  } catch (error) {
    console.error('Error marking changelogs as read:', error);
    return apiError('common.internal', 500);
  }
}
