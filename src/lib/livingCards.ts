/**
 * Living cards: every card is refreshed from its developer's GitHub profile now
 * and then, so stats follow the real developer (more stars, more repos → stronger card).
 *
 * The refresh keeps the card's identity: RARITY and PRIMARY LANGUAGE never change
 * here (collections, sets, the collector score and the battle type rely on them).
 * Stats are recomputed with the current formula for the card's own rarity — but
 * only while the developer still belongs to that rarity. A Common whose developer
 * now has an Epic profile keeps its stats (otherwise it would become a Common with
 * Epic numbers and break the rarity balance); only name, avatar, bio and the
 * profile snapshot are refreshed. The next real draw updates it whole.
 * A real draw of the same developer from a pack still rewrites the whole card
 * (upsertCard): that one must match the rarity the pack rolled.
 *
 * Pure rules here; the rotation (one global slot, oldest card first) is in livingCardService.ts.
 */
import { computeCardStats, type BaseStats, type StatInputs } from './cardStats';
import { isRarity, type Rarity } from './rarity';
import { toCardProfile, type DevStats } from './githubService';

/** A card is due again this long after its last refresh. */
export const LIVING_CARD_REFRESH_DAYS = 7;
/** One global refresh slot per window (shared by every server instance), and cards per slot. */
export const LIVING_CARD_SLOT_SECONDS = 5 * 60;
export const LIVING_CARD_BATCH = 3;
/** Cards refreshed by the daily cron, on top of the traffic-driven slots. */
export const LIVING_CARD_CRON_BATCH = 30;

const YEAR_MS = 1000 * 60 * 60 * 24 * 365.25;

/** The stat formula inputs of a freshly fetched developer (same numbers as buildDevStats). */
export function devStatInputs(dev: DevStats, now = new Date()): StatInputs | null {
  if (dev.githubCreatedAt === undefined || dev.publicRepos === undefined) return null;
  return {
    totalStars: dev.totalStars,
    totalForks: dev.totalForks ?? 0,
    publicRepos: dev.publicRepos,
    publicGists: dev.publicGists ?? 0,
    followers: dev.followers,
    accountAgeYears: (now.getTime() - new Date(dev.githubCreatedAt).getTime()) / YEAR_MS,
  };
}

export interface LivingCard {
  rarity: string;
  atk: number;
  def: number;
  hp: number;
}

/**
 * The columns a refresh writes: stats for the card's own rarity (unless the
 * developer drifted to another rarity, `drifted`), plus name, avatar, bio and
 * the profile snapshot behind the card title. Null when the fetched data is
 * incomplete (nothing to recompute from).
 */
export function livingCardUpdate(card: LivingCard, dev: DevStats, now = new Date()) {
  const inputs = devStatInputs(dev, now);
  if (!inputs || !isRarity(card.rarity)) return null;
  const drifted = dev.rarity !== card.rarity;
  const stats: BaseStats = drifted
    ? { atk: card.atk, def: card.def, hp: card.hp }
    : computeCardStats(inputs, card.rarity as Rarity);
  return {
    drifted,
    atk: stats.atk,
    def: stats.def,
    hp: stats.hp,
    name: dev.name,
    avatarUrl: dev.avatarUrl,
    flavorText: dev.flavorText,
    ...toCardProfile(dev),
  };
}

export function statsChanged(card: LivingCard, update: BaseStats): boolean {
  return card.atk !== update.atk || card.def !== update.def || card.hp !== update.hp;
}
