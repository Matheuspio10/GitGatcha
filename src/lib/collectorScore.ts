/**
 * Collector ranking (pure, client-safe): points per UNIQUE card, weighted by
 * rarity (roughly how much rarer each tier is to pull). Gives a place on the
 * rankings to players who collect rather than battle.
 */
import { RARITY_ORDER, type Rarity } from './rarity';

export const COLLECTOR_POINTS: Record<Rarity, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 5,
  Epic: 12,
  Legendary: 30,
};

export function collectorPoints(byRarity: Partial<Record<string, number>>): number {
  return RARITY_ORDER.reduce((sum, r) => sum + (byRarity[r] ?? 0) * COLLECTOR_POINTS[r], 0);
}

/** "Common 1 · Uncommon 2 · …" for the ranking's explanation. */
export function collectorPointsLegend(): string {
  return RARITY_ORDER.map(r => `${r} ${COLLECTOR_POINTS[r]}`).join(' · ');
}
