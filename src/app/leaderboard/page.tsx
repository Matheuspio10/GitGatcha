import { Trophy, Medal, Sword, Shield, Star } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { UserAvatar } from '@/components/UserAvatar';

async function getBattleStats(userId: string) {
  try {
    const totalBattles = await prisma.battle.count({
      where: {
        status: 'COMPLETED',
        OR: [{ challengerId: userId }, { defenderId: userId }],
      },
    });
    const totalWins = await prisma.battle.count({
      where: {
        status: 'COMPLETED',
        winnerId: userId,
      },
    });
    const winRate = totalBattles > 0 ? Math.round((totalWins / totalBattles) * 100) : 0;
    return { totalBattles, totalWins, winRate };
  } catch {
    return { totalBattles: 0, totalWins: 0, winRate: 0 };
  }
}

export default async function LeaderboardPage() {
  const currentUser = await getCurrentUser();

  // Try rating-based, fall back to xp-based if rating column doesn't exist yet
  let users;
  let hasRating = true;
  try {
    users = await prisma.user.findMany({
      where: {
        cards: {
          some: {}
        }
      },
      orderBy: { rating: 'desc' },
      take: 50,
      include: {
        _count: { select: { cards: true } },
      }
    });
  } catch {
    hasRating = false;
    users = await prisma.user.findMany({
      where: {
        cards: {
          some: {}
        }
      },
      orderBy: { xp: 'desc' },
      take: 50,
      include: {
        _count: { select: { cards: true } },
      }
    });
  }

  // Calculate win stats for each user
  const usersWithStats = await Promise.all(
    users.map(async (u) => {
      const stats = await getBattleStats(u.id);
      return {
        ...u,
        rating: (u as Record<string, unknown>).rating as number ?? 1000,
        ...stats,
      };
    })
  );

  // Friends leaderboard
  let friendsLeaderboard: typeof usersWithStats = [];
  if (currentUser) {
    try {
      const friendBattles = await prisma.battle.findMany({
        where: {
          status: 'COMPLETED',
          isRandom: false,
          OR: [{ challengerId: currentUser.id }, { defenderId: currentUser.id }],
        },
        select: { challengerId: true, defenderId: true },
      });

      const friendIds = new Set<string>();
      friendBattles.forEach(b => {
        if (b.challengerId !== currentUser.id) friendIds.add(b.challengerId);
        if (b.defenderId && b.defenderId !== currentUser.id) friendIds.add(b.defenderId);
      });

      if (friendIds.size > 0) {
        const friends = await prisma.user.findMany({
          where: { 
             id: { in: Array.from(friendIds) },
             cards: { some: {} }
          },
          orderBy: hasRating ? { rating: 'desc' } : { xp: 'desc' },
          include: { _count: { select: { cards: true } } },
        });

        friendsLeaderboard = await Promise.all(
          friends.map(async (u) => {
            const stats = await getBattleStats(u.id);
            return {
              ...u,
              rating: (u as Record<string, unknown>).rating as number ?? 1000,
              ...stats,
            };
          })
        );
      }
    } catch {
      // Battle table doesn't exist yet, skip friends leaderboard
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-12">
      <div className="text-center">
        <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-600 mb-2 tracking-tighter">
          Global Rankings
        </h1>
        <p className="text-slate-400 text-lg">The most legendary developers in the repository.</p>
      </div>

      {/* Global Leaderboard */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md">
        <table className="w-full text-left">
          <thead className="bg-black/50 border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider">Rank</th>
              <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider">Player</th>
              <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-1"><Star size={14} weight="fill" /> Rating</span>
              </th>
              <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
                <span className="flex items-center gap-1"><Sword size={14} weight="fill" /> W/L</span>
              </th>
              <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
                <span className="flex items-center gap-1"><Shield size={14} weight="fill" /> Win Rate</span>
              </th>
              <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">Cards</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {usersWithStats.map((u, i) => {
               const displayUsername = u.username || u.name || 'Anonymous';
               const linkUsername = u.username ? u.username : (u.name ? u.name : 'Anonymous');
               
               return (
              <tr key={u.id} className={`hover:bg-white/5 transition-colors ${currentUser?.id === u.id ? 'bg-indigo-500/5' : ''}`}>
                <td className="px-5 py-4">
                  {i === 0 ? <Trophy className="text-yellow-400" size={24} weight="fill" /> :
                   i === 1 ? <Medal className="text-slate-300" size={24} weight="fill" /> :
                   i === 2 ? <Medal className="text-amber-600" size={24} weight="fill" /> :
                   <span className="text-slate-500 font-mono font-bold ml-1">{i + 1}</span>}
                </td>
                <td className="px-5 py-4 font-bold text-white">
                  <Link href={`/profile/${encodeURIComponent(linkUsername)}`} className="flex items-center gap-3 hover:text-indigo-400 transition-colors group">
                    <UserAvatar username={displayUsername} image={u.image} size="sm" />
                    <span>{displayUsername}</span>
                    {currentUser?.id === u.id && (
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">YOU</span>
                    )}
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <span className="text-yellow-400 font-bold font-mono">{u.rating}</span>
                </td>
                <td className="px-5 py-4 hidden md:table-cell">
                  <span className="text-green-400 font-bold">{u.totalWins}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-red-400">{u.totalBattles - u.totalWins}</span>
                </td>
                <td className="px-5 py-4 hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                        style={{ width: `${u.winRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-300">{u.winRate}%</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-300 hidden lg:table-cell">{u._count.cards}</td>
              </tr>
            )})}
          </tbody>
        </table>
        {usersWithStats.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No players found. Be the first to join the battle!
          </div>
        )}
      </div>

      {/* Friends Leaderboard */}
      {friendsLeaderboard.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <Trophy size={24} className="text-orange-400" />
            Rivals Leaderboard
          </h2>
          <div className="bg-slate-900/60 border border-orange-500/20 rounded-2xl overflow-hidden backdrop-blur-md">
            <table className="w-full text-left">
              <thead className="bg-black/50 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-bold text-xs uppercase tracking-wider">Rank</th>
                  <th className="px-5 py-3 font-bold text-xs uppercase tracking-wider">Player</th>
                  <th className="px-5 py-3 font-bold text-xs uppercase tracking-wider">Rating</th>
                  <th className="px-5 py-3 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {friendsLeaderboard.map((u, i) => {
                   const uLinkUser = u.username ? u.username : (u.name ? u.name : 'Anonymous');
                   return (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-slate-400 font-mono font-bold">{i + 1}</td>
                    <td className="px-5 py-3 font-bold text-white">
                      <Link href={`/profile/${encodeURIComponent(uLinkUser)}`} className="flex items-center gap-3 hover:text-indigo-400 transition-colors group">
                        <UserAvatar username={uLinkUser} image={u.image} size="sm" />
                        <span>{u.username || u.name || 'Anonymous'}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-yellow-400 font-bold font-mono">{u.rating}</td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <span className="text-sm font-bold text-slate-300">{u.winRate}%</span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
