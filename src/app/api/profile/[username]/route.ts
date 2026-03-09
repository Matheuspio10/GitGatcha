import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const resolvedParams = await params;
    const username = resolvedParams.username;
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const uncapitalizedUsername = username.toLowerCase(); // Handle case sensitivity depending on how we store it, assume DB might be case-insensitive for unique constraints, but we can do a precise check
    // Fetch user details
    const userProfile = await prisma.user.findFirst({
      where: { 
        username: {
            equals: username,
            mode: 'insensitive'
        }
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
            where: { status: 'ACCEPTED' }
        },
        friendRequests: {
            where: { status: 'ACCEPTED' }
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
    const friendsCount = userProfile.friendships.length + userProfile.friendRequests.length;

    // Get top cards (highest stats or rarity, we'll simplify and list some cards)
    const topCards = userProfile.cards
        .map((uc: any) => ({ ...uc.card, quantity: uc.quantity, isShiny: uc.isShiny }))
        .sort((a: any, b: any) => (b.atk + b.def + b.hp) - (a.atk + a.def + a.hp))
        .slice(0, 5); // top 5 strongest cards

    return NextResponse.json({ 
        user: {
            id: userProfile.id,
            username: userProfile.username,
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
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
