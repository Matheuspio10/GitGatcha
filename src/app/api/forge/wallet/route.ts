import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/apiResponse';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        currency: true,
        fragments: true,
        fragmentLogs: true,
        wishlist: true
      }
    });

    if (!user) return apiError('common.userNotFound', 404);

    return NextResponse.json({
      currency: user.currency,
      fragments: user.fragments || {},
      fragmentLogs: user.fragmentLogs || [],
      wishlist: user.wishlist || []
    });
  } catch (error) {
    console.error('Wallet fetch error:', error);
    return apiError('forge.walletFailed', 500);
  }
}
