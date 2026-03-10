import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ currency: user.currency });
  } catch (error) {
    console.error('Error fetching currency:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
