import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    // Fetch changelogs first, since we can show them even to unauthenticated users theoretically,
    // but the unread dot requires knowing who they are.
    const entries = await prisma.changelogEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });

    let seenChangelogs: string[] = [];

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { seenChangelogs: true },
      });
      
      if (user && Array.isArray(user.seenChangelogs)) {
        seenChangelogs = user.seenChangelogs as string[];
      }
    }

    return NextResponse.json({ entries, seenChangelogs });
  } catch (error) {
    console.error('Error fetching changelogs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
