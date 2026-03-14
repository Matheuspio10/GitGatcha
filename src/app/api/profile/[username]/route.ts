import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const resolvedParams = await params;
    
    if (!resolvedParams.username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const username = decodeURIComponent(resolvedParams.username);

    const uncapitalizedUsername = username.toLowerCase(); // Handle case sensitivity depending on how we store it, assume DB might be case-insensitive for unique constraints, but we can do a precise check
    // Fetch user details
    const userProfile = await prisma.user.findFirst({
      where: { 
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { name: { equals: username, mode: 'insensitive' } }
        ]
      },
      include: {
        cards: {
            include: {
                card: true,
            }
        },
        battlesAsChallenger: {
          select: {
            winnerId: true,
            status: true,
          }
        },
        battlesAsDefender: {
          select: {
            winnerId: true,
            status: true,
          }
        },
        friendships: {
            where: { status: 'ACCEPTED' },
            include: {
              friend: { select: { id: true, username: true, level: true } },
            }
        },
        friendRequests: {
            where: { status: 'ACCEPTED' },
            include: {
              user: { select: { id: true, username: true, level: true } },
            }
        }
      } as any,
    }) as any;

    if (!userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate derived stats
    const totalCards = userProfile.cards.length;
    const completedBattles = [...userProfile.battlesAsChallenger, ...userProfile.battlesAsDefender].filter(
        b => b.status === 'COMPLETED'
    );
    const battlesWon = completedBattles.filter(b => b.winnerId === userProfile.id).length;
    const battlesLost = completedBattles.length - battlesWon;

    // Build normalized friends list from both directions
    const friendsList = [
      ...userProfile.friendships.map((f: any) => ({
        id: f.friend.id,
        username: f.friend.username,
        level: f.friend.level,
      })),
      ...userProfile.friendRequests.map((f: any) => ({
        id: f.user.id,
        username: f.user.username,
        level: f.user.level,
      })),
    ];
    const friendsCount = friendsList.length;

    // Get top cards (highest stats or rarity, we'll simplify and list some cards)
    const topCards = userProfile.cards
        .map((uc: any) => ({ ...uc.card, quantity: uc.quantity, isShiny: uc.isShiny }))
        .sort((a: any, b: any) => (b.atk + b.def + b.hp) - (a.atk + a.def + a.hp))
        .slice(0, 5); // top 5 strongest cards

    // Get showcase cards (loyalty system Hall of Fame)
    // Showcase cards must be Reliable tier or higher, and ordered by showcaseOrder
    const showcaseCards = userProfile.cards
        .filter((uc: any) => uc.loyaltyTier === 'reliable' || uc.loyaltyTier === 'legendary_bond' || uc.loyaltyTier === 'eternal')
        .sort((a: any, b: any) => {
            if (a.showcaseOrder !== null && b.showcaseOrder !== null) return a.showcaseOrder - b.showcaseOrder;
            if (a.showcaseOrder !== null) return -1;
            if (b.showcaseOrder !== null) return 1;
            return b.loyaltyCount - a.loyaltyCount; // fallback to highest loyalty
        })
        .slice(0, 6)
        .map((uc: any) => ({
            ...uc.card,
            quantity: uc.quantity,
            isShiny: uc.isShiny,
            loyaltyTier: uc.loyaltyTier,
            loyaltyCount: Math.max(0, uc.loyaltyCount),
        }));

    // Check for Prestige Badge: Legendary Bond (has any card with 100+ battles)
    const hasLegendaryBondPrestige = userProfile.cards.some((uc: any) => uc.loyaltyCount >= 100);

    // Check for level ups in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notifications = Array.isArray(userProfile.notifications) ? userProfile.notifications as any[] : [];
    const hasLeveledUpRecently = notifications.some((n: any) => {
        if (n.type === 'LEVEL_UP') {
            const notifDate = new Date(n.timestamp);
            return notifDate >= oneDayAgo;
        }
        return false;
    });

    return NextResponse.json({ 
        user: {
            id: userProfile.id,
            username: userProfile.username || userProfile.name || 'Unknown',
            level: userProfile.level,
            xp: userProfile.xp,
            rating: userProfile.rating,
            createdAt: userProfile.createdAt,
        },
        stats: {
            totalCards,
            battlesWon,
            battlesLost,
            totalBattles: completedBattles.length,
            friendsCount,
        },
        topCards,
        showcaseCards,
        friends: friendsList,
        hasLeveledUpRecently,
        hasLegendaryBondPrestige,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
