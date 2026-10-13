import { Trophy, Medal, Sword, Shield, Star, Users, Globe, Cards } from '@phosphor-icons/react/dist/ssr';
import { Prisma } from '@prisma/client';
import { RARITY_ORDER } from '@/lib/rarity';
import { COLLECTOR_POINTS, collectorPointsLegend } from '@/lib/collectorScore';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { sortLeaderboard } from '@/lib/leaderboard';
import { STARTING_RATING } from '@/lib/battleConfig';
import { LeaderboardAvatar } from './LeaderboardAvatar';
import { RankBadge as TierBadge } from '@/components/RankBadge';
import { SeasonBanner } from '@/components/SeasonBanner';
import { getCurrentSeason } from '@/lib/seasonService';

const GLOBAL_LIMIT = 50;

interface BattleCounts {
  totalBattles: number;
  totalWins: number;
  pvpWins: number;
}

interface LeaderboardRow extends BattleCounts {
  id: string;
  displayName: string;
  linkName: string;
  image: string | null;
  rating: number;
  createdAt: Date;
  cardCount: number;
  winRate: number;
}

/** Completed-battle counts per player, in 4 grouped queries (no N+1). */
async function getBattleCounts(): Promise<Map<string, BattleCounts>> {
  const [asChallenger, asDefender, wins, pvpWins] = await Promise.all([
    prisma.battle.groupBy({ by: ['challengerId'], where: { status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.battle.groupBy({ by: ['defenderId'], where: { status: 'COMPLETED', defenderId: { not: null } }, _count: { _all: true } }),
    prisma.battle.groupBy({ by: ['winnerId'], where: { status: 'COMPLETED', winnerId: { not: null } }, _count: { _all: true } }),
    prisma.battle.groupBy({ by: ['winnerId'], where: { status: 'COMPLETED', isRandom: false, winnerId: { not: null } }, _count: { _all: true } }),
  ]);

  const counts = new Map<string, BattleCounts>();
  const get = (id: string) => {
    let c = counts.get(id);
    if (!c) {
      c = { totalBattles: 0, totalWins: 0, pvpWins: 0 };
      counts.set(id, c);
    }
    return c;
  };
  for (const r of asChallenger) get(r.challengerId).totalBattles += r._count._all;
  for (const r of asDefender) if (r.defenderId) get(r.defenderId).totalBattles += r._count._all;
  for (const r of wins) if (r.winnerId && counts.has(r.winnerId)) get(r.winnerId).totalWins += r._count._all;
  for (const r of pvpWins) if (r.winnerId && counts.has(r.winnerId)) get(r.winnerId).pvpWins += r._count._all;
  return counts;
}

/** Loads the players (without their avatar, which can be a large base64 string) and ranks them. */
async function loadRows(ids: string[], counts: Map<string, BattleCounts>): Promise<LeaderboardRow[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, name: true, rating: true, createdAt: true, _count: { select: { cards: true } } },
  });
  return sortLeaderboard(
    users.map(u => {
      const c = counts.get(u.id) ?? { totalBattles: 0, totalWins: 0, pvpWins: 0 };
      return {
        id: u.id,
        displayName: u.username || u.name || 'Anonymous',
        linkName: u.username || u.name || 'Anonymous',
        image: null,
        rating: u.rating ?? STARTING_RATING,
        createdAt: u.createdAt,
        cardCount: u._count.cards,
        ...c,
        winRate: c.totalBattles > 0 ? Math.round((c.totalWins / c.totalBattles) * 100) : 0,
      };
    })
  );
}

async function attachImages(rows: LeaderboardRow[]) {
  if (rows.length === 0) return;
  const images = await prisma.user.findMany({
    where: { id: { in: rows.map(r => r.id) } },
    select: { id: true, image: true },
  });
  const byId = new Map(images.map(i => [i.id, i.image]));
  for (const r of rows) r.image = byId.get(r.id) || null;
}

interface CollectorRow {
  id: string;
  name: string;
  image: string | null;
  points: number;
  uniqueCards: number;
  legendaries: number;
}

/** Collector ranking: points per unique card weighted by rarity, summed in one query. */
async function loadCollectors(): Promise<CollectorRow[]> {
  const pointsCase = Prisma.join(RARITY_ORDER.map(r => Prisma.sql`WHEN ${r} THEN ${COLLECTOR_POINTS[r]}`), ' ');
  const rows = await prisma.$queryRaw<{ id: string; points: number; uniqueCards: number; legendaries: number }[]>`
    SELECT uc."userId" AS id,
           SUM(CASE c."rarity" ${pointsCase} ELSE 0 END)::int AS points,
           COUNT(*)::int AS "uniqueCards",
           (COUNT(*) FILTER (WHERE c."rarity" = 'Legendary'))::int AS legendaries
    FROM "UserCard" uc
    JOIN "Card" c ON c."id" = uc."cardId"
    GROUP BY uc."userId"
    ORDER BY points DESC, "uniqueCards" DESC
    LIMIT ${GLOBAL_LIMIT}
  `;
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map(r => r.id) } },
    select: { id: true, username: true, name: true, image: true },
  });
  const byId = new Map(users.map(u => [u.id, u]));
  return rows
    .filter(r => byId.get(r.id)?.username)
    .map(r => {
      const u = byId.get(r.id)!;
      return { ...r, name: u.username || u.name || 'Anonymous', image: u.image || null };
    });
}

function CollectorTable({ rows, currentUserId }: { rows: CollectorRow[]; currentUserId?: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      <table className="w-full table-fixed text-left">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th className="w-16 px-5 py-4 font-bold text-xs uppercase tracking-wider">Rank</th>
            <th className="px-5 py-4 font-bold text-xs uppercase tracking-wider">Player</th>
            <th className="w-28 px-5 py-4 font-bold text-xs uppercase tracking-wider">Points</th>
            <th className="w-28 px-5 py-4 font-bold text-xs uppercase tracking-wider hidden sm:table-cell">Unique</th>
            <th className="w-28 px-5 py-4 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Legendary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={`border-b border-slate-800/50 ${r.id === currentUserId ? 'bg-indigo-500/10' : 'hover:bg-slate-800/30'}`}>
              <td className="px-5 py-4"><RankBadge index={i} /></td>
              <td className="px-5 py-4">
                <Link href={`/u/${encodeURIComponent(r.name)}`} className="flex items-center gap-3 min-w-0">
                  <LeaderboardAvatar username={r.name} image={r.image} />
                  <span className="truncate font-bold text-white">{r.name}</span>
                </Link>
              </td>
              <td className="px-5 py-4 font-mono font-bold text-emerald-300">{r.points}</td>
              <td className="px-5 py-4 text-slate-300 hidden sm:table-cell">{r.uniqueCards}</td>
              <td className="px-5 py-4 text-yellow-300 hidden md:table-cell">{r.legendaries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankBadge({ index }: { index: number }) {
  if (index === 0) return <Trophy className="text-yellow-400" size={24} weight="fill" />;
  if (index === 1) return <Medal className="text-slate-300" size={24} weight="fill" />;
  if (index === 2) return <Medal className="text-amber-600" size={24} weight="fill" />;
  return <span className="text-slate-500 font-mono font-bold ml-1">{index + 1}</span>;
}

function LeaderboardTable({ rows, currentUserId, accent }: { rows: LeaderboardRow[]; currentUserId?: string; accent: string }) {
  return (
    <div className={`bg-slate-900/60 border ${accent} rounded-2xl overflow-hidden backdrop-blur-md`}>
      <table className="w-full table-fixed text-left">
        <thead className="bg-black/50 border-b border-slate-800 text-slate-400">
          <tr>
            <th className="w-12 sm:w-20 px-3 sm:px-5 py-4 font-bold text-xs uppercase tracking-wider">
              <span className="sr-only sm:not-sr-only">Rank</span>
              <span className="sm:hidden" aria-hidden="true">#</span>
            </th>
            <th className="px-2 sm:px-5 py-4 font-bold text-xs uppercase tracking-wider">Player</th>
            <th className="w-20 sm:w-28 px-3 sm:px-5 py-4 font-bold text-xs uppercase tracking-wider">
              <span className="flex items-center gap-1"><Star size={14} weight="fill" /> Rating</span>
            </th>
            <th className="w-28 px-5 py-4 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
              <span className="flex items-center gap-1"><Sword size={14} weight="fill" /> W/L</span>
            </th>
            <th className="w-36 px-5 py-4 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
              <span className="flex items-center gap-1"><Shield size={14} weight="fill" /> Win Rate</span>
            </th>
            <th className="w-24 px-5 py-4 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">Cards</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {rows.map((u, i) => (
            <tr key={u.id} className={`hover:bg-white/5 transition-colors ${currentUserId === u.id ? 'bg-indigo-500/5' : ''}`}>
              <td className="px-3 sm:px-5 py-4">
                <RankBadge index={i} />
              </td>
              <td className="px-2 sm:px-5 py-4 font-bold text-white">
                <Link href={`/profile/${encodeURIComponent(u.linkName)}`} className="flex items-center gap-2 sm:gap-3 min-w-0 hover:text-indigo-400 transition-colors">
                  <LeaderboardAvatar username={u.displayName} image={u.image} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{u.displayName}</span>
                      {currentUserId === u.id && (
                        <span className="shrink-0 text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-full">YOU</span>
                      )}
                    </span>
                    {/* Secondary stats move under the name on small screens */}
                    <span className="md:hidden block text-[11px] font-normal text-slate-500 truncate">
                      {u.totalWins}W / {u.totalBattles - u.totalWins}L · {u.winRate}%
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-3 sm:px-5 py-4">
                <TierBadge rating={u.rating} />
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
              <td className="px-5 py-4 text-slate-300 hidden lg:table-cell">{u.cardCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const currentUser = await getCurrentUser();
  const { tab } = await searchParams;
  const now = new Date();
  // Closes a season that already ended (pays it, resets ratings) before showing anything
  const [season, viewerSeason] = await Promise.all([
    getCurrentSeason(now),
    currentUser ? prisma.user.findUnique({ where: { id: currentUser.id }, select: { seasonPeakRating: true, seasonBattles: true } }) : null,
  ]);
  const showRivals = tab === 'rivals' && !!currentUser;
  const showCollectors = tab === 'collectors';

  const collectors = showCollectors ? await loadCollectors() : [];
  const counts = showCollectors ? new Map<string, BattleCounts>() : await getBattleCounts();

  let rows: LeaderboardRow[];
  if (showCollectors) {
    rows = [];
  } else if (showRivals) {
    // Rivals = accepted friends (either direction) + you
    const friendships = await prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userId: currentUser.id }, { friendId: currentUser.id }] },
      select: { userId: true, friendId: true },
    });
    const ids = new Set<string>([currentUser.id]);
    for (const f of friendships) ids.add(f.userId === currentUser.id ? f.friendId : f.userId);
    rows = await loadRows(Array.from(ids), counts);
  } else {
    // Only players who finished at least one battle (hides never-played and test accounts)
    const ids = Array.from(counts.entries()).filter(([, c]) => c.totalBattles > 0).map(([id]) => id);
    rows = (await loadRows(ids, counts)).slice(0, GLOBAL_LIMIT);
  }
  await attachImages(rows);

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${
      active
        ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300'
        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
    }`;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-600 mb-2 tracking-tighter">
          Global Rankings
        </h1>
        <p className="text-slate-400 text-base sm:text-lg">The most legendary developers in the repository.</p>
        <p className="text-slate-500 text-xs mt-2">
          Rating only changes in PvP: Ranked battles and friend challenges. Ties: PvP wins, then battles played, then oldest account.
        </p>
      </div>

      {season && !showCollectors && <SeasonBanner season={season} now={now} viewer={viewerSeason} />}

      <div className="flex justify-center gap-2">
        <Link href="/leaderboard" className={tabClass(!showRivals && !showCollectors)}>
          <Globe size={16} weight="fill" /> Global
        </Link>
        {currentUser && (
          <Link href="/leaderboard?tab=rivals" className={tabClass(showRivals)}>
            <Users size={16} weight="fill" /> Rivals
          </Link>
        )}
        <Link href="/leaderboard?tab=collectors" className={tabClass(showCollectors)}>
          <Cards size={16} weight="fill" /> Collectors
        </Link>
      </div>

      {showCollectors && (
        <>
          <p className="text-center text-xs text-slate-500">
            Points per unique card: {collectorPointsLegend()}. No battles needed.
          </p>
          <CollectorTable rows={collectors} currentUserId={currentUser?.id} />
        </>
      )}

      {!showCollectors && <LeaderboardTable
        rows={rows}
        currentUserId={currentUser?.id}
        accent={showRivals ? 'border-orange-500/20' : 'border-slate-800'}
      />}

      {!showCollectors && rows.length === 0 && (
        <div className="p-12 text-center text-slate-500">
          No players found. Be the first to join the battle!
        </div>
      )}
      {showRivals && rows.length <= 1 && (
        <p className="text-center text-sm text-slate-500">
          Add friends from their profiles to compare your rating with theirs.
        </p>
      )}
    </div>
  );
}
