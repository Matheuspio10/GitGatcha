import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

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

    // Check if the username is already taken
    const existingUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() } // Ensure we compare strictly or uniquely
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Username is already taken. Please choose another one.' }, { status: 409 });
    }

    // Check strict case matches against other users since prisma might be case sensitive or insensitive depending on collation
    const exists = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      }
    });

    if (exists) {
      return NextResponse.json({ error: 'Username is already taken. Please choose another one.' }, { status: 409 });
    }

    // Update the db
    await prisma.user.update({
      where: { id: userId },
      data: { username: username }
    });

    return NextResponse.json({ success: true, username });
  } catch (error) {
    console.error('Error setting username:', error);
    return NextResponse.json({ error: 'Internal server error while saving username.' }, { status: 500 });
  }
}
