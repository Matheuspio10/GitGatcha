import { useTranslations } from 'next-intl';
import { rankForRating } from '@/lib/ranks';
import { useGameText } from '@/i18n/gameText';

/** Ranked tier (elo) of a rating: "Gold · 1180". */
export function RankBadge({ rating, showRating = true, className = '' }: { rating: number; showRating?: boolean; className?: string }) {
  const t = useTranslations('common');
  const battleText = useGameText('gameBattle');
  const tier = rankForRating(rating);
  const name = battleText(`ranks.${tier.id}.name`, tier.name);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${className}`}
      style={{ color: tier.color, borderColor: `${tier.color}66`, background: `${tier.color}14` }}
      title={t('rankBadge', { tier: name, rating: String(rating) })}
    >
      <span aria-hidden>◆</span>
      {name}
      {showRating && <span className="font-mono font-normal opacity-80">{rating}</span>}
    </span>
  );
}
