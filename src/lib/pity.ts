/**
 * Legendary pity (pure logic). Every booster opened without a Legendary card
 * increments `User.packsSinceLegendary`; once PITY_THRESHOLD - 1 packs in a row
 * gave no Legendary, the next one is guaranteed to (its last slot is upgraded).
 * All-Common packs (Junk Drawer) neither count nor trigger the pity.
 */

export const PITY_THRESHOLD = 30;

/** Whether the next pack must contain a Legendary. */
export function pityDue(packsSinceLegendary: number): boolean {
  return packsSinceLegendary >= PITY_THRESHOLD - 1;
}

/**
 * Upgrades the last slot to Legendary when the pity is due and no slot already is.
 * Returns a new array; `triggered` says whether a slot was changed.
 */
export function applyPity(rarities: readonly string[], packsSinceLegendary: number): { rarities: string[]; triggered: boolean } {
  const result = [...rarities];
  if (result.length === 0 || !pityDue(packsSinceLegendary) || result.includes('Legendary')) {
    return { rarities: result, triggered: false };
  }
  result[result.length - 1] = 'Legendary';
  return { rarities: result, triggered: true };
}

/**
 * Counter change after a pack's cards were granted, as an atomic update:
 * reset when a Legendary was granted, otherwise one more. A pity pack already
 * reset the counter when it claimed the pity, so it leaves it alone: packs
 * opened in parallel may have counted since then. A pity that was consumed but
 * whose Legendary couldn't be granted is put back to due, so the next pack gets it.
 */
export function pityCounterUpdate(gotLegendary: boolean, pityTriggered: boolean): { set: number } | { increment: number } {
  if (gotLegendary) return pityTriggered ? { increment: 0 } : { set: 0 };
  return { increment: pityTriggered ? PITY_THRESHOLD - 1 : 1 };
}

/** "Legendary guaranteed within N packs" (N counts the next pack: 1 means the next one). */
export function packsUntilPity(packsSinceLegendary: number): number {
  return Math.max(1, PITY_THRESHOLD - Math.max(0, packsSinceLegendary));
}
