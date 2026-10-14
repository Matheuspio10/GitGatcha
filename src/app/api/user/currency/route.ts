import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiError } from '@/lib/apiResponse';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return apiError('common.unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    });

    if (!user) return apiError('common.userNotFound', 404);

    return NextResponse.json({ currency: user.currency });
  } catch (error) {
    console.error('Error fetching currency:', error);
    return apiError('common.internal', 500);
  }
}
