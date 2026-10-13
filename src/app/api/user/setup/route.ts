import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { withUserLock } from '@/lib/userLock';
import { startOnboarding } from '@/lib/onboardingService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username } = await req.json();

    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: 'Username must be between 3 and 20 characters.' }, { status: 400 });
    }

    const isAlphanumeric = /^[a-zA-Z0-9_]+$/.test(username);
    if (!isAlphanumeric) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores.' }, { status: 400 });
    }

    // Taken by ANOTHER player (case-insensitive). The player's own name doesn't count:
    // the setup form comes pre-filled with the name generated at sign-up.
    const taken = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' }, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: 'Username is already taken. Please choose another one.' }, { status: 409 });
    }

    // Save the username; the first time, the player also gets the starter pack
    // and the "Getting started" checklist
    const starterPack = await withUserLock(userId, async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: { hasSetupProfile: true } });
      await tx.user.update({
        where: { id: userId },
        data: { username: username, hasSetupProfile: true }
      });
      return before?.hasSetupProfile === false ? startOnboarding(tx, userId) : false;
    });

    return NextResponse.json({ success: true, username, starterPack });
  } catch (error) {
    console.error('Error setting username:', error);
    return NextResponse.json({ error: 'Internal server error while saving username.' }, { status: 500 });
  }
}
