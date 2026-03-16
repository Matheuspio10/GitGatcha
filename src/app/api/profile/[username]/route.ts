import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Achievement definitions
const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', description: 'Win your first battle', icon: '⚔️', check: (s: any) => s.battlesWon >= 1 },
  { id: 'veteran', name: 'Veteran', description: 'Use a single card in 10+ battles', icon: '🎖️', check: (_s: any, cards: any[]) => cards.some((c: any) => c.loyaltyCount >= 10) },
  { id: 'legendary_pull', name: 'Legendary Pull', description: 'Own a Legendary rarity card', icon: '🌟', check: (_s: any, cards: any[]) => cards.some((c: any) => c.card?.rarity === 'Legendary') },
  { id: 'perfect_season', name: 'Perfect Season', description: 'Achieve a 10-win streak', icon: '🔥', check: (s: any) => s.highestWinStreak >= 10 },
  { id: 'polyglot', name: 'Polyglot', description: 'Own cards in 5 different languages', icon: '🌐', check: (_s: any, cards: any[]) => { const langs = new Set(cards.map((c: any) => c.card?.primaryLanguage).filter(Boolean)); return langs.size >= 5; } },
  { id: 'hall_of_famer', name: 'Hall of Famer', description: 'Reach 50 battles with any single card', icon: '🏛️', check: (_s: any, cards: any[]) => cards.some((c: any) => c.loyaltyCount >= 50) },
  { id: 'centurion', name: 'Centurion', description: 'Complete 100 total battles', icon: '💯', check: (s: any) => s.totalBattles >= 100 },
  { id: 'collector', name: 'Collector', description: 'Own 20 or more cards', icon: '📚', check: (s: any) => s.totalCards >= 20 },
  { id: 'social_butterfly', name: 'Social Butterfly', description: 'Have 10 or more friends', icon: '🦋', check: (s: any) => s.friendsCount >= 10 },
  { id: 'shiny_hunter', name: 'Shiny Hunter', description: 'Own a Shiny card', icon: '✨', check: (_s: any, cards: any[]) => cards.some((c: any) => c.isShiny) },
  { id: 'rising_star', name: 'Rising Star', description: 'Reach 1200 rating', icon: '⭐', check: (s: any) => s.rating >= 1200 },
  { id: 'eternal_bond', name: 'Eternal Bond', description: 'Reach Eternal loyalty tier with a card', icon: '💎', check: (_s: any, cards: any[]) => cards.some((c: any) => c.loyaltyTier === 'eternal') },
];

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
    const topCards = userProfile.cards
        .map((uc: any) => ({ ...uc.card, quantity: uc.quantity, isShiny: uc.isShiny, loyaltyTier: uc.loyaltyTier, loyaltyCount: uc.loyaltyCount }))
        .sort((a: any, b: any) => (b.atk + b.def + b.hp) - (a.atk + a.def + a.hp))
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
            loyaltyTier: uc.loyaltyTier,
            loyaltyCount: Math.max(0, uc.loyaltyCount),
        }));

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

    // Compute achievements
    const statsForAchievements = {
      battlesWon,
      totalBattles: completedBattles.length,
      totalCards,
      friendsCount,
      highestWinStreak,
      rating: userProfile.rating,
    };

    const achievements = ACHIEVEMENTS.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      unlocked: a.check(statsForAchievements, userProfile.cards),
    }));

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
        },
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
        hasLeveledUpRecently,
        hasLegendaryBondPrestige,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
