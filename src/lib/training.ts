/**
 * Card training (pure, client-safe). Each level adds TRAINING_BONUS_PER_LEVEL to
 * the card's ATK, DEF and HP in battle, on top of loyalty. It is per UserCard, so
 * it never changes the card's generated stats (no STAT_VERSION bump).
 *
 * A level is paid with BITS plus fragments of the card's language (wildcards
 * cover what is missing), the same currency duplicates turn into. Commons can be
 * trained further than Legendaries, so a favourite card keeps up.
 */
import { DUPLICATE_FRAGMENTS } from './fragments';
import { isRarity, type Rarity } from './rarity';

/** +2% ATK, DEF and HP per level. */
export const TRAINING_BONUS_PER_LEVEL = 0.02;

/**
 * Highest training level per rarity. Sized with the balance simulator: a fully
 * trained team about evens out with an untrained team one rarity up (Common has
 * the widest gap to close), and beats its own untrained rarity ~70% of the time.
 */
export const TRAINING_MAX_LEVEL: Record<Rarity, number> = {
  Common: 8,
  Uncommon: 4,
  Rare: 4,
  Epic: 3,
  Legendary: 3,
};

/** BITS per level step: level n costs n × this. */
export const TRAINING_BITS_PER_STEP: Record<Rarity, number> = {
  Common: 50,
  Uncommon: 100,
  Rare: 200,
  Epic: 400,
  Legendary: 800,
};

/** Fragments per level step: level n costs n × one duplicate of the card. */
export const TRAINING_FRAGMENTS_PER_STEP: Record<Rarity, number> = DUPLICATE_FRAGMENTS as Record<Rarity, number>;

const asRarity = (rarity: string): Rarity => (isRarity(rarity) ? rarity : 'Common');

export function maxTrainingLevel(rarity: string): number {
  return TRAINING_MAX_LEVEL[asRarity(rarity)];
}

/** A stored level, clamped to what the rarity allows. */
export function clampTrainingLevel(level: number | null | undefined, rarity: string): number {
  if (!Number.isFinite(level) || !level || level < 0) return 0;
  return Math.min(Math.floor(level), maxTrainingLevel(rarity));
}

/** Battle stat multiplier of a trained card (1 when untrained). */
export function trainingMultiplier(level: number | null | undefined, rarity: string): number {
  return 1 + clampTrainingLevel(level, rarity) * TRAINING_BONUS_PER_LEVEL;
}

/** Cost of going from `level` to `level + 1`; null at the cap. */
export function trainingCost(level: number, rarity: string): { bits: number; fragments: number } | null {
  const r = asRarity(rarity);
  const next = clampTrainingLevel(level, r) + 1;
  if (next > TRAINING_MAX_LEVEL[r]) return null;
  return { bits: TRAINING_BITS_PER_STEP[r] * next, fragments: TRAINING_FRAGMENTS_PER_STEP[r] * next };
}

/** Everything spent to train a card of `rarity` from 0 to its cap. */
export function fullTrainingCost(rarity: string): { bits: number; fragments: number } {
  let bits = 0;
  let fragments = 0;
  for (let level = 0; level < maxTrainingLevel(rarity); level++) {
    const step = trainingCost(level, rarity)!;
    bits += step.bits;
    fragments += step.fragments;
  }
  return { bits, fragments };
}

/** ATK, DEF and HP as they enter a battle after training (before loyalty and stamina). */
export function trainedStats<T extends { atk: number; def: number; hp: number; rarity: string }>(card: T, level: number | null | undefined) {
  const m = trainingMultiplier(level, card.rarity);
  return { atk: Math.floor(card.atk * m), def: Math.floor(card.def * m), hp: Math.floor(card.hp * m) };
}
