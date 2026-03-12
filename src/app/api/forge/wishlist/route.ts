import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchGitHubUserStats } from '@/lib/githubService';
import { getInvocationCost } from '@/lib/forgeService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { username } = await req.json();
    if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const wishlist: any[] = Array.isArray(user.wishlist) ? [...user.wishlist] : [];

    if (wishlist.length >= 5) {
      return NextResponse.json({ error: 'Wishlist is full (max 5)' }, { status: 400 });
    }
    
    // Check if already in wishlist
    if (wishlist.some(w => w && w.username && w.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json({ error: 'Already in wishlist' }, { status: 400 });
    }

    const stats = await fetchGitHubUserStats(username);
    if (!stats) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
    if (!stats.primaryLanguage || stats.primaryLanguage === 'Unknown') {
      return NextResponse.json({ error: 'Developer lacks a primary language' }, { status: 400 });
    }

    const { fragments } = getInvocationCost(stats.rarity);

    const wishlistItem = {
      username: stats.githubUsername,
      name: stats.name || stats.githubUsername,
      avatarUrl: stats.avatarUrl,
      primaryLanguage: stats.primaryLanguage,
      rarity: stats.rarity,
      fragmentsRequired: fragments
    };

    wishlist.push(wishlistItem);

    await prisma.user.update({
      where: { id: user.id },
      data: { wishlist }
    });

    return NextResponse.json({ success: true, wishlist });
  } catch (error) {
    console.error('Wishlist POST error:', error);
    return NextResponse.json({ error: 'Failed to add to wishlist' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let wishlist: any[] = Array.isArray(user.wishlist) ? [...user.wishlist] : [];
    wishlist = wishlist.filter(w => w && w.username && w.username.toLowerCase() !== username.toLowerCase());

    await prisma.user.update({
      where: { id: user.id },
      data: { wishlist }
    });

    return NextResponse.json({ success: true, wishlist });
  } catch (error) {
    console.error('Wishlist DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove from wishlist' }, { status: 500 });
  }
}
