export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export type Rarity = (typeof RARITY_ORDER)[number];

/**
 * A card's base rarity is its follower band. Bands must stay expressible as a
 * GitHub search qualifier: that is what lets the booster sampler draw uniformly
 * among *every* developer of a given rarity (including the player themself).
 * Bands are disjoint and cover every follower count.
 */
export const RARITY_FOLLOWER_BANDS: Record<Rarity, { min: number; max: number | null }> = {
  Common: { min: 0, max: 49 },
  Uncommon: { min: 50, max: 199 },
  Rare: { min: 200, max: 999 },
  Epic: { min: 1000, max: 4999 },
  Legendary: { min: 5000, max: null },
};

/**
 * Star bonus: a developer whose repositories collect at least this many stars
 * is promoted one tier above their follower band (a surprise upgrade on reveal).
 */
export const STAR_BONUS_THRESHOLD: Partial<Record<Rarity, number>> = {
  Common: 1_000,
  Uncommon: 3_000,
  Rare: 10_000,
  Epic: 30_000,
};

/**
 * Stat multiplier of the 'impact' stat formula (src/lib/cardStats.ts). The
 * live 'fame' formula uses FAME_RARITY_MULTIPLIER there; use
 * `rarityMultipliers()` / `ACTIVE_RARITY_MULTIPLIER` from cardStats.ts for the
 * multiplier actually applied to cards.
 *
 * Deliberately small: higher follower bands already come with more repos,
 * older accounts and more stars, so the profile itself carries most of the
 * rarity gap (tuned with src/lib/balanceSim.ts — the old 0.5→2.5, and even
 * 0.85→1.35, made rarity decide ~99% of battles).
 */
export const RARITY_STAT_MULTIPLIER: Record<Rarity, number> = {
  Common: 1.0,
  Uncommon: 1.0,
  Rare: 1.0,
  Epic: 1.02,
  Legendary: 1.03,
};

/**
 * Rarity odds of each booster slot (5-card packs; slot 5 repeats for longer packs).
 * Packs with a guaranteed minimum upgrade their lowest card afterwards.
 */
export const BOOSTER_SLOT_ODDS: Partial<Record<Rarity, number>>[] = [
  { Common: 1 },
  { Common: 1 },
  { Common: 0.7, Uncommon: 0.3 },
  { Uncommon: 0.6, Rare: 0.4 },
  { Rare: 0.55, Epic: 0.3, Legendary: 0.15 },
];

/** Picks a rarity for slot `index` from a uniform `roll` in [0, 1). */
export function rarityForSlot(index: number, roll: number): Rarity {
  const odds = BOOSTER_SLOT_ODDS[Math.min(index, BOOSTER_SLOT_ODDS.length - 1)];
  let acc = 0;
  for (const rarity of RARITY_ORDER) {
    acc += odds[rarity] ?? 0;
    if (roll < acc) return rarity;
  }
  return 'Common';
}

/** Average share of each rarity among the cards of a standard 5-card booster (before the star bonus). */
export function averagePullRates(): Record<Rarity, number> {
  const rates = Object.fromEntries(RARITY_ORDER.map(r => [r, 0])) as Record<Rarity, number>;
  for (const odds of BOOSTER_SLOT_ODDS) {
    for (const r of RARITY_ORDER) rates[r] += (odds[r] ?? 0) / BOOSTER_SLOT_ODDS.length;
  }
  return rates;
}

export function followerBandRarity(followers: number): Rarity {
  for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
    const rarity = RARITY_ORDER[i];
    if (followers >= RARITY_FOLLOWER_BANDS[rarity].min) return rarity;
  }
  return 'Common';
}

export function isInFollowerBand(followers: number, rarity: Rarity): boolean {
  const { min, max } = RARITY_FOLLOWER_BANDS[rarity];
  return followers >= min && (max === null || followers <= max);
}

/** GitHub search qualifier for a follower band, e.g. `followers:200..999`. */
export function followerBandQualifier(rarity: Rarity): string {
  const { min, max } = RARITY_FOLLOWER_BANDS[rarity];
  return max === null ? `followers:>=${min}` : `followers:${min}..${max}`;
}

export function computeRarity(followers: number, totalStars: number): { baseRarity: Rarity; rarity: Rarity; starBonus: boolean } {
  const baseRarity = followerBandRarity(followers);
  const threshold = STAR_BONUS_THRESHOLD[baseRarity];
  const starBonus = threshold !== undefined && totalStars >= threshold;
  const rarity = starBonus ? RARITY_ORDER[RARITY_ORDER.indexOf(baseRarity) + 1] : baseRarity;
  return { baseRarity, rarity, starBonus };
}

export function isRarity(value: unknown): value is Rarity {
  return typeof value === 'string' && (RARITY_ORDER as readonly string[]).includes(value);
}
