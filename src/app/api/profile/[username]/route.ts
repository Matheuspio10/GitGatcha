import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getAchievementViews, syncAchievementsSafe } from '@/lib/achievementService';
import { collectionProgress } from '@/lib/collections';
import { equippedCosmetics } from '@/lib/cosmeticsService';

function computeWinStreak(battles: any[], userId: string): number {
  let maxStreak = 0;
  let currentStreak = 0;
  // battles should be sorted by completedAt ascending
  for (const b of battles) {
    if (b.winnerId === userId) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  return maxStreak;
}

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

    const userProfile = await prisma.user.findFirst({
      where: { 
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { name: { equals: username, mode: 'insensitive' } }
        ]
      },
      include: {
        seasonResults: { select: { seasonId: true, peakRating: true }, orderBy: { seasonId: 'desc' }, take: 12 },
        cards: {
            include: {
                card: true,
            }
        },
        battlesAsChallenger: {
          select: {
            id: true,
            winnerId: true,
            status: true,
            leagueMode: true,
            rewardBits: true,
            completedAt: true,
            createdAt: true,
            challengerId: true,
            defenderId: true,
            challengerTeam: true,
            defenderTeam: true,
            log: true,
            defender: { select: { id: true, username: true, name: true, image: true } },
          }
        },
        battlesAsDefender: {
          select: {
            id: true,
            winnerId: true,
            status: true,
            leagueMode: true,
            rewardBits: true,
            completedAt: true,
            createdAt: true,
            challengerId: true,
            defenderId: true,
            challengerTeam: true,
            defenderTeam: true,
            log: true,
            challenger: { select: { id: true, username: true, name: true, image: true } },
          }
        },
        friendships: {
            where: { status: 'ACCEPTED' },
            include: {
              friend: { select: { id: true, username: true, name: true, level: true, image: true } },
            }
        },
        friendRequests: {
            where: { status: 'ACCEPTED' },
            include: {
              user: { select: { id: true, username: true, name: true, level: true, image: true } },
            }
        }
      } as any,
    }) as any;

    if (!userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate derived stats
    const totalCards = userProfile.cards.length;
    const allBattles = [...userProfile.battlesAsChallenger, ...userProfile.battlesAsDefender];
    const completedBattles = allBattles.filter((b: any) => b.status === 'COMPLETED');
    const battlesWon = completedBattles.filter((b: any) => b.winnerId === userProfile.id).length;
    const battlesLost = completedBattles.length - battlesWon;

    // Total BITS earned
    const totalBitsEarned = completedBattles.reduce((sum: number, b: any) => {
      if (b.winnerId === userProfile.id) return sum + (b.rewardBits || 0);
      return sum + 10; // losers get ~10 bits
    }, 0);

    // Highest win streak 
    const sortedBattles = completedBattles
      .filter((b: any) => b.completedAt)
      .sort((a: any, b: any) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
    const highestWinStreak = computeWinStreak(sortedBattles, userProfile.id);

    // Build normalized friends list from both directions
    const friendsList = [
      ...userProfile.friendships.map((f: any) => ({
        id: f.friend.id,
        username: f.friend.username || f.friend.name || 'Unknown',
        level: f.friend.level,
        image: f.friend.image || null,
      })),
      ...userProfile.friendRequests.map((f: any) => ({
        id: f.user.id,
        username: f.user.username || f.user.name || 'Unknown',
        level: f.user.level,
        image: f.user.image || null,
      })),
    ];
    const friendsCount = friendsList.length;

    // Get top cards (highest stats or rarity)
    // The player's own Signature card (from connecting GitHub) always leads
    const topCards = userProfile.cards
        .map((uc: any) => ({ ...uc.card, quantity: uc.quantity, isShiny: uc.isShiny, edition: uc.edition, loyaltyTier: uc.loyaltyTier, loyaltyCount: uc.loyaltyCount }))
        .sort((a: any, b: any) => Number(b.edition === 'signature') - Number(a.edition === 'signature') || (b.atk + b.def + b.hp) - (a.atk + a.def + a.hp))
        .slice(0, 5);

    // Get showcase cards (loyalty system Hall of Fame)
    const showcaseCards = userProfile.cards
        .filter((uc: any) => uc.loyaltyTier === 'reliable' || uc.loyaltyTier === 'legendary_bond' || uc.loyaltyTier === 'eternal')
        .sort((a: any, b: any) => {
            if (a.showcaseOrder !== null && b.showcaseOrder !== null) return a.showcaseOrder - b.showcaseOrder;
            if (a.showcaseOrder !== null) return -1;
            if (b.showcaseOrder !== null) return 1;
            return b.loyaltyCount - a.loyaltyCount;
        })
        .slice(0, 6)
        .map((uc: any) => ({
            ...uc.card,
            quantity: uc.quantity,
            isShiny: uc.isShiny,
            edition: uc.edition,
            loyaltyTier: uc.loyaltyTier,
            loyaltyCount: Math.max(0, uc.loyaltyCount),
        }));

    // Language sets (one slot per rarity) and the equipped title and frame
    const sets = collectionProgress(userProfile.cards.map((uc: { card: { primaryLanguage: string | null; rarity: string } }) => uc.card));

    // Check for Prestige Badge
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

    // Recent battles (last 10)
    const recentBattles = completedBattles
      .filter((b: any) => b.completedAt)
      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 10)
      .map((b: any) => {
        const isChallenger = b.challengerId === userProfile.id;
        const opponent = isChallenger ? b.defender : b.challenger;
        const opponentUsername = opponent?.username || opponent?.name || 'Unknown';
        const opponentImage = opponent?.image || null;
        const won = b.winnerId === userProfile.id;
        
        // Compute score from log
        const log = Array.isArray(b.log) ? b.log : [];
        let playerScore = 0;
        let opponentScore = 0;
        for (const entry of log) {
          if (entry.type === 'ROUND_END' || entry.winner) {
            if (entry.winner === (isChallenger ? 'CHALLENGER' : 'DEFENDER')) {
              playerScore++;
            } else if (entry.winner === (isChallenger ? 'DEFENDER' : 'CHALLENGER')) {
              opponentScore++;
            }
          }
        }
        
        return {
          id: b.id,
          opponentUsername,
          opponentImage,
          leagueMode: b.leagueMode || 'OPEN',
          won,
          playerScore,
          opponentScore,
          date: b.completedAt,
          challengerTeam: b.challengerTeam,
          defenderTeam: b.defenderTeam,
          log: b.log,
          isChallenger,
        };
      });

    // Achievements: persisted tiers + live progress. On the player's own profile, newly
    // reached tiers are persisted and paid first (and returned for the unlock toasts).
    const session = await getServerSession(authOptions);
    const isOwnProfile = session?.user?.id === userProfile.id;
    const achievementsUnlocked = isOwnProfile ? await syncAchievementsSafe(userProfile.id) : [];
    const achievements = await getAchievementViews(userProfile.id);

    return NextResponse.json({ 
        user: {
            id: userProfile.id,
            username: userProfile.username || userProfile.name || 'Unknown',
            level: userProfile.level,
            xp: userProfile.xp,
            rating: userProfile.rating,
            createdAt: userProfile.createdAt,
            image: userProfile.image || null,
            bio: userProfile.bio || null,
            bannerImage: userProfile.bannerImage || null,
            preferredLanguage: userProfile.preferredLanguage || null,
            seasons: userProfile.seasonResults,
            ...equippedCosmetics(userProfile),
        },
        setsCompleted: sets.filter(s => s.complete).length,
        setsTotal: sets.length,
        stats: {
            totalCards,
            battlesWon,
            battlesLost,
            totalBattles: completedBattles.length,
            friendsCount,
            totalBitsEarned,
            highestWinStreak,
        },
        topCards,
        showcaseCards,
        friends: friendsList,
        recentBattles,
        achievements,
        achievementsUnlocked,
        hasLeveledUpRecently,
        hasLegendaryBondPrestige,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
