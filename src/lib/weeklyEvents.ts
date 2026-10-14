/**
 * Weekly events (pure, client-safe), tied to the theme of the Weekly Sprint:
 *
 * - an event booster, on sale only during the week of its theme. Its pool is the
 *   theme's languages and, like every booster, each dev in it has the same chance;
 * - the Dev of the Week: a card of the theme drawn at random when the week starts,
 *   invoked at the Forge for less until the week ends.
 */
import { INVOCATION_COSTS } from './forgeService';
import { RARITY_ORDER, type Rarity } from './rarity';
import { sprintPeriod, type SprintTheme } from './sprints';

export const EVENT_PACK_COST = 350;
export const EVENT_PACK_CARD_COUNT = 5;
export const EVENT_PACK_MIN_RARITY: Rarity = 'Rare';

/** Share of the Forge price (fragments and BITS) taken off the Dev of the Week. */
export const FEATURED_DEV_DISCOUNT = 0.5;
/** The Dev of the Week is drawn among the theme's cards of at least this rarity (any rarity when there are none). */
export const FEATURED_DEV_MIN_RARITY: Rarity = 'Rare';

const EVENT_PACK_PREFIX = 'event-';

/** "family:web" → "event-web" */
export function eventPackId(theme: SprintTheme): string {
  return EVENT_PACK_PREFIX + theme.id.replace(/^family:/, '');
}

export function isEventPackId(packId: string): boolean {
  return packId.startsWith(EVENT_PACK_PREFIX);
}

/** The event booster on sale at `now` (the one of the running Weekly Sprint). */
export function activeEventPackId(now: Date): string {
  return eventPackId(sprintPeriod('weekly', now).theme);
}

/** This week's event booster and next week's, whose reserve the cron fills ahead of Monday. */
export function upcomingEventPackIds(now: Date): string[] {
  const { endsAt } = sprintPeriod('weekly', now);
  return [activeEventPackId(now), activeEventPackId(endsAt)];
}

/** Rarities the Dev of the Week is drawn from. */
export function featuredDevRarities(): Rarity[] {
  return RARITY_ORDER.slice(RARITY_ORDER.indexOf(FEATURED_DEV_MIN_RARITY));
}

export function isFeaturedDev(login: string, featured: string | null | undefined): boolean {
  return !!featured && login.toLowerCase() === featured.toLowerCase();
}

export interface InvocationCost {
  fragments: number;
  bits: number;
}

/** Forge price of the Dev of the Week (rounded up, so it never becomes free). */
export function featuredInvocationCost(cost: InvocationCost): InvocationCost {
  return {
    fragments: Math.ceil(cost.fragments * (1 - FEATURED_DEV_DISCOUNT)),
    bits: Math.ceil(cost.bits * (1 - FEATURED_DEV_DISCOUNT)),
  };
}

/** Forge price for a dev of `rarity`, discounted when it is the Dev of the Week. */
export function forgeCostFor(rarity: string, featured: boolean): InvocationCost {
  const base = INVOCATION_COSTS[rarity] ?? INVOCATION_COSTS.Common;
  return featured ? featuredInvocationCost(base) : base;
}
