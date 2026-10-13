import { RANK_TIERS } from '@/lib/ranks';
import { PROMOTION_BITS, SEASON_REWARD_BITS, formatSeasonLeft } from '@/lib/seasons';
import { RankBadge } from '@/components/RankBadge';

/** Current ranked season: time left, the viewer's peak, and what each rank pays. */
export function SeasonBanner({ season, now, viewer }: {
  season: { id: number; endsAt: Date };
  now: Date;
  viewer?: { seasonPeakRating: number; seasonBattles: number } | null;
}) {
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Season {season.id}</p>
          <p className="text-sm text-slate-300">
            Ends in <span className="font-mono font-bold text-white">{formatSeasonLeft(season.endsAt.getTime() - now.getTime())}</span>.
            Ratings then reset halfway back to the start.
          </p>
        </div>
        {viewer && (
          <div className="text-right text-xs text-slate-400">
            <div className="mb-1">Your season peak</div>
            <RankBadge rating={viewer.seasonPeakRating} />
            <div className="mt-1">{viewer.seasonBattles} PvP battle{viewer.seasonBattles === 1 ? '' : 's'} this season</div>
          </div>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 pr-3 text-left font-bold">Rank</th>
              {RANK_TIERS.map(t => <th key={t.id} className="px-2 py-1 font-bold" style={{ color: t.color }}>{t.name}</th>)}
            </tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            <tr>
              <td className="py-1 pr-3 text-left font-sans text-slate-400">First time this season</td>
              {RANK_TIERS.map(t => <td key={t.id} className="px-2 py-1 text-center">{PROMOTION_BITS[t.id] ? `+${PROMOTION_BITS[t.id]}` : '—'}</td>)}
            </tr>
            <tr>
              <td className="py-1 pr-3 text-left font-sans text-slate-400">End of season (peak)</td>
              {RANK_TIERS.map(t => <td key={t.id} className="px-2 py-1 text-center">+{SEASON_REWARD_BITS[t.id]}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">End-of-season BITS go to everyone with at least one Ranked battle or friend challenge in the season.</p>
    </div>
  );
}
