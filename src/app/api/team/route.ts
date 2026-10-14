import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiError, readBody } from '@/lib/apiResponse';
import { z } from 'zod';

/** The team builder's slots (global cardIds, up to 3; an empty team is fine). */
const bodySchema = z.object(
  {
    cardIds: z
      .array(z.string({ error: 'team.invalidPayload' }).max(100, { error: 'team.invalidPayload' }), { error: 'team.invalidPayload' })
      .max(3, { error: 'team.invalidPayload' }),
  },
  { error: 'team.invalidPayload' },
);

/**
 * Handle GET to fetch which cards are currently marked as inActiveTeam.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const activeCards = await prisma.userCard.findMany({
      where: {
        userId,
        inActiveTeam: true
      },
      select: {
        id: true,
        cardId: true
      }
    });

    return NextResponse.json({ activeCards });
  } catch (error) {
    console.error('Fetch active team error:', error);
    return apiError('team.fetchFailed', 500);
  }
}

/**
 * Handle POST to update which cards are in active team.
 * The flag only remembers the last team picked in the team builder: it no
 * longer affects stamina (every card recovers over time), so stamina and
 * lastUsedAt are left untouched.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { cardIds } = body.data; // These are the global cardIds

    await prisma.$transaction([
      prisma.userCard.updateMany({
        where: { userId, inActiveTeam: true, cardId: { notIn: cardIds } },
        data: { inActiveTeam: false },
      }),
      prisma.userCard.updateMany({
        where: { userId, inActiveTeam: false, cardId: { in: cardIds } },
        data: { inActiveTeam: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update active team error:', error);
    return apiError('team.updateFailed', 500);
  }
}
