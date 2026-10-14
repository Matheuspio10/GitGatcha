import { useTranslations } from 'next-intl';
import { RANK_TIERS } from '@/lib/ranks';
import { PROMOTION_BITS, SEASON_REWARD_BITS, formatSeasonLeft } from '@/lib/seasons';
import { RankBadge } from '@/components/RankBadge';

/** Current ranked season: time left, the viewer's peak, and what each rank pays. */
export function SeasonBanner({ season, now, viewer }: {
  season: { id: number; endsAt: Date };
  now: Date;
  viewer?: { seasonPeakRating: number; seasonBattles: number } | null;
}) {
  const t = useTranslations('leaderboard.season');
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-orange-300">{t('title', { id: season.id })}</p>
          <p className="text-sm text-slate-300">
            {t.rich('endsIn', {
              left: formatSeasonLeft(season.endsAt.getTime() - now.getTime()),
              time: chunks => <span className="font-mono font-bold text-white">{chunks}</span>,
            })}
          </p>
        </div>
        {viewer && (
          <div className="text-right text-xs text-slate-400">
            <div className="mb-1">{t('yourPeak')}</div>
            <RankBadge rating={viewer.seasonPeakRating} />
            <div className="mt-1">{t('battles', { count: viewer.seasonBattles })}</div>
          </div>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 pr-3 text-left font-bold">{t('rank')}</th>
              {RANK_TIERS.map(tier => <th key={tier.id} className="px-2 py-1 font-bold" style={{ color: tier.color }}>{tier.name}</th>)}
            </tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            <tr>
              <td className="py-1 pr-3 text-left font-sans text-slate-400">{t('firstTime')}</td>
              {RANK_TIERS.map(tier => <td key={tier.id} className="px-2 py-1 text-center">{PROMOTION_BITS[tier.id] ? `+${PROMOTION_BITS[tier.id]}` : '—'}</td>)}
            </tr>
            <tr>
              <td className="py-1 pr-3 text-left font-sans text-slate-400">{t('endOfSeason')}</td>
              {RANK_TIERS.map(tier => <td key={tier.id} className="px-2 py-1 text-center">+{SEASON_REWARD_BITS[tier.id]}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{t('rewardsNote')}</p>
    </div>
  );
}
