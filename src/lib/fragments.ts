/**
 * Fragment wallet rules (pure, client-safe). Fragments are per language
 * (User.fragments: { TypeScript: 40, … }). Wildcard fragments, kept under the
 * WILDCARD key, are bought with WILDCARD_EXCHANGE_RATE fragments of any
 * language and pay for any language, including developers with no primary
 * language, who have no fragments of their own.
 */

export const WILDCARD = 'Wildcard';

/** Fragments of the card's language for pulling a card you already have. */
export const DUPLICATE_FRAGMENTS: Record<string, number> = {
  Common: 5,
  Uncommon: 10,
  Rare: 20,
  Epic: 40,
  Legendary: 80,
};
/** Chance that a booster also drops fragments of its theme (or most common) language. */
export const PACK_DROP_CHANCE = 0.15;
export const PACK_DROP_FRAGMENTS = 20;
/** Chance of a Shiny on every pull (a duplicate of a non-Shiny card upgrades it). */
export const SHINY_CHANCE = 0.05;
/** Language fragments spent per wildcard fragment. */
export const WILDCARD_EXCHANGE_RATE = 3;

/** Languages that have no fragments of their own: only wildcards pay for them. */
export function needsWildcards(language: string | null | undefined): boolean {
  return !language || language === 'Unknown' || language === WILDCARD;
}

/**
 * How a fragment cost is paid: the language's own fragments first, wildcards
 * for the rest. Null when the wallet can't cover it.
 */
export function planFragmentPayment(
  wallet: Record<string, number>,
  language: string | null | undefined,
  cost: number,
): { fromLanguage: number; fromWildcard: number } | null {
  const own = needsWildcards(language) ? 0 : Math.max(0, wallet[language as string] ?? 0);
  const fromLanguage = Math.min(own, cost);
  const fromWildcard = cost - fromLanguage;
  if (fromWildcard > Math.max(0, wallet[WILDCARD] ?? 0)) return null;
  return { fromLanguage, fromWildcard };
}

/** Wildcards a wallet can still buy with one language's fragments. */
export function maxWildcardsFrom(wallet: Record<string, number>, language: string): number {
  if (needsWildcards(language)) return 0;
  return Math.floor(Math.max(0, wallet[language] ?? 0) / WILDCARD_EXCHANGE_RATE);
}
