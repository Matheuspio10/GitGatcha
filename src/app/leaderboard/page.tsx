import { Trophy, Medal, Star } from '@phosphor-icons/react/dist/ssr';

export default async function LeaderboardPage() {
  const users = await prisma.user.findMany({
    orderBy: { xp: 'desc' },
    take: 50,
    include: {
      _count: {
        select: { cards: true, battlesAsAttacker: true }
      }
    }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="text-center">
        <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-600 mb-4 tracking-tighter">
          Global Leaderboard
        </h1>
        <p className="text-slate-400 text-lg">The most legendary developers in the repository.</p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md">
        <table className="w-full text-left">
          <thead className="bg-black/50 border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-bold">Rank</th>
              <th className="px-6 py-4 font-bold">Player</th>
              <th className="px-6 py-4 font-bold">Level</th>
              <th className="px-6 py-4 font-bold">XP</th>
              <th className="px-6 py-4 font-bold hidden md:table-cell">Cards Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {users.map((u, i) => (
              <tr key={u.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  {i === 0 ? <Trophy className="text-yellow-400" size={24} weight="fill" /> : 
                   i === 1 ? <Medal className="text-slate-300" size={24} weight="fill" /> : 
                   i === 2 ? <Medal className="text-amber-600" size={24} weight="fill" /> : 
                   <span className="text-slate-500 font-mono font-bold ml-1">{i + 1}</span>}
                </td>
                <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs">
                    {(u.username || 'A').charAt(0).toUpperCase()}
                  </div>
                  {u.username || 'Anonymous'}
                </td>
                <td className="px-6 py-4 text-blue-400 font-bold">{u.level}</td>
                <td className="px-6 py-4 text-yellow-400 font-mono flex items-center gap-1.5">
                  <Star size={16} weight="fill" /> {u.xp}
                </td>
                <td className="px-6 py-4 text-slate-300 hidden md:table-cell">{u._count.cards} Unique</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No players found. Be the first to join the battle!
          </div>
        )}
      </div>
    </div>
  );
}
