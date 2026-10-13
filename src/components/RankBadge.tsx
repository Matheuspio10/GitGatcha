import { rankForRating } from '@/lib/ranks';

/** Ranked tier (elo) of a rating: "Gold · 1180". */
export function RankBadge({ rating, showRating = true, className = '' }: { rating: number; showRating?: boolean; className?: string }) {
  const tier = rankForRating(rating);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${className}`}
      style={{ color: tier.color, borderColor: `${tier.color}66`, background: `${tier.color}14` }}
      title={`${tier.name} rank (rating ${rating})`}
    >
      <span aria-hidden>◆</span>
      {tier.name}
      {showRating && <span className="font-mono font-normal opacity-80">{rating}</span>}
    </span>
  );
}
