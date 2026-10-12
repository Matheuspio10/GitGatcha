import React, { useId } from 'react';

/** Per-rarity palette shared by the card frame, header gem and booster UI. */
export const RARITY_GEM_COLORS: Record<string, { light: string; mid: string; dark: string }> = {
  Common: { light: '#e2e8f0', mid: '#94a3b8', dark: '#475569' },
  Uncommon: { light: '#bbf7d0', mid: '#22c55e', dark: '#14532d' },
  Rare: { light: '#bfdbfe', mid: '#3b82f6', dark: '#1e3a8a' },
  Epic: { light: '#f5d0fe', mid: '#a855f7', dark: '#4c1d95' },
  Legendary: { light: '#fef9c3', mid: '#f59e0b', dark: '#78350f' },
};

// One silhouette per rarity so the tier reads even without colour
const SHAPES: Record<string, string> = {
  Common: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16z', // round stud
  Uncommon: 'M12 2 L21 12 L12 22 L3 12 Z', // diamond
  Rare: 'M7 3 H17 L22 9 L12 22 L2 9 Z', // cut gem
  Epic: 'M12 1.5 L21.5 7 V17 L12 22.5 L2.5 17 V7 Z', // hexagon
  Legendary: 'M3 18 L2 7 L7.5 11 L12 3 L16.5 11 L22 7 L21 18 Z', // crown
};

// Facet highlights drawn on top of the silhouette
const FACETS: Record<string, string> = {
  Common: 'M8.5 9.5a4 4 0 0 1 4-2.5',
  Uncommon: 'M12 2 L12 22 M3 12 L21 12',
  Rare: 'M2 9 H22 M7 3 L9.5 9 L12 22 L14.5 9 L17 3',
  Epic: 'M12 1.5 V12 M2.5 7 L12 12 L21.5 7',
  Legendary: 'M5 15.5 H19',
};

export function RarityGem({ rarity, size = 14, className, title }: { rarity: string; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const key = SHAPES[rarity] ? rarity : 'Common';
  const c = RARITY_GEM_COLORS[key];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...(title === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title ?? rarity })}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
      </defs>
      <path d={SHAPES[key]} fill={`url(#g${id})`} stroke={c.dark} strokeWidth={1.2} strokeLinejoin="round" />
      <path d={FACETS[key]} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} strokeLinecap="round" />
      {key === 'Legendary' && (
        <>
          <circle cx="12" cy="3" r="1.4" fill={c.light} />
          <circle cx="2" cy="7" r="1.2" fill={c.light} />
          <circle cx="22" cy="7" r="1.2" fill={c.light} />
        </>
      )}
    </svg>
  );
}
