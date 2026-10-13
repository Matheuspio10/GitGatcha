import { RARITY_ORDER, packAtLeastOdds } from '@/lib/rarity';

const RARITY_COLOR: Record<string, string> = {
  Common: 'text-slate-300',
  Uncommon: 'text-green-400',
  Rare: 'text-blue-400',
  Epic: 'text-purple-400',
  Legendary: 'text-yellow-400',
};

function percent(x: number) {
  if (x >= 1) return '100%';
  if (x <= 0) return '0%';
  const p = x * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/**
 * The real odds of one pack, computed from the booster slot odds (rarity.ts):
 * the chance of getting at least one card of each rarity or better. Shown
 * before buying and before opening (odds must be transparent).
 */
export function PackOdds({ pack, pityDue = false }: {
  pack: { cardCount: number; guaranteedMinRarity?: string | null; allCommon?: boolean };
  /** The player's Legendary pity is due: this pack's last card will be a Legendary. */
  pityDue?: boolean;
}) {
  const odds = packAtLeastOdds(pack);
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Chance of at least one…</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {RARITY_ORDER.filter(r => r !== 'Common').map(r => {
          const value = r === 'Legendary' && pityDue && !pack.allCommon ? 1 : odds[r];
          return (
            <li key={r} className="flex justify-between gap-2">
              <span className={RARITY_COLOR[r]}>{r}{r !== 'Legendary' ? '+' : ''}</span>
              <span className="font-mono text-slate-200">{percent(value)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        {pack.allCommon
          ? 'Every card is a Common.'
          : `${pack.cardCount} cards${pack.guaranteedMinRarity ? `, at least one ${pack.guaranteedMinRarity} or better guaranteed` : ''}${pityDue ? ', and your pity makes the last one a Legendary' : ''}. `}
        Odds before the star bonus: a developer with enough stars is promoted one rarity.
      </p>
    </div>
  );
}
