import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchGitHubUserStats } from '@/lib/githubService';
import { getInvocationCost } from '@/lib/forgeService';
import { apiError, readBody } from '@/lib/apiResponse';
import { z } from 'zod';

const MAX_WISHLIST = 5;
const bodySchema = z.object({ username: z.string().trim().max(100).optional() }).optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const username = body.data?.username;
    if (!username) return apiError('forge.usernameRequired');

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, wishlist: true } });
    if (!user) return apiError('common.userNotFound', 404);

    const wishlist: any[] = Array.isArray(user.wishlist) ? [...user.wishlist] : [];

    if (wishlist.length >= MAX_WISHLIST) {
      return apiError('forge.wishlistFull', 400, { max: MAX_WISHLIST });
    }
    
    // Check if already in wishlist
    if (wishlist.some(w => w && w.username && w.username.toLowerCase() === username.toLowerCase())) {
      return apiError('forge.alreadyInWishlist');
    }

    const stats = await fetchGitHubUserStats(username);
    if (!stats) return apiError('forge.devNotFound', 404);
    if (!stats.primaryLanguage || stats.primaryLanguage === 'Unknown') {
      return apiError('forge.noPrimaryLanguage');
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
      select: { id: true },
      where: { id: user.id },
      data: { wishlist }
    });

    return NextResponse.json({ success: true, wishlist });
  } catch (error) {
    console.error('Wishlist POST error:', error);
    return apiError('forge.wishlistAddFailed', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);

    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) return apiError('forge.usernameRequired');

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, wishlist: true } });
    if (!user) return apiError('common.userNotFound', 404);

    let wishlist: any[] = Array.isArray(user.wishlist) ? [...user.wishlist] : [];
    wishlist = wishlist.filter(w => w && w.username && w.username.toLowerCase() !== username.toLowerCase());

    await prisma.user.update({
      select: { id: true },
      where: { id: user.id },
      data: { wishlist }
    });

    return NextResponse.json({ success: true, wishlist });
  } catch (error) {
    console.error('Wishlist DELETE error:', error);
    return apiError('forge.wishlistRemoveFailed', 500);
  }
}
