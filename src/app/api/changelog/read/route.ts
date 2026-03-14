import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { entryIds } = await req.json();

    if (!Array.isArray(entryIds)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { seenChangelogs: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const currentSeen = Array.isArray(user.seenChangelogs) ? (user.seenChangelogs as string[]) : [];
    
    // Add only new ids
    const newSeen = Array.from(new Set([...currentSeen, ...entryIds]));

    await prisma.user.update({
      where: { id: userId },
      data: {
        seenChangelogs: newSeen,
      },
    });

    return NextResponse.json({ success: true, seenChangelogs: newSeen });
  } catch (error) {
    console.error('Error marking changelogs as read:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
