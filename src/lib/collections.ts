/**
 * Collection sets and profile cosmetics (pure, client-safe).
 *
 * Boosters draw from the whole of GitHub, so a pack has no fixed roster to
 * complete. A set is a combat language instead, with one slot per rarity: own a
 * Common, Uncommon, Rare, Epic and Legendary card of that primary language and
 * the set is complete (the Forge can fill any slot).
 *
 * Completed sets and player levels unlock titles and avatar frames. Unlocks are
 * never stored: cards are never taken away and levels never go down, so they are
 * worked out from the collection and the level whenever needed.
 */
import { COMBAT_LANGUAGES } from './battleConfig';
import { RARITY_ORDER, type Rarity } from './rarity';

/** One set per combat language. */
export const COLLECTION_LANGUAGES: readonly string[] = COMBAT_LANGUAGES;

export interface SetProgress {
  language: string;
  /** Rarities owned in this language. */
  owned: Rarity[];
  /** 0–1 (owned slots / 5). */
  share: number;
  complete: boolean;
}

/** Progress of every set from the player's cards (one entry per owned card). */
export function collectionProgress(cards: readonly { primaryLanguage?: string | null; rarity: string }[]): SetProgress[] {
  const owned = new Map<string, Set<Rarity>>();
  for (const c of cards) {
    if (!c.primaryLanguage || !COLLECTION_LANGUAGES.includes(c.primaryLanguage)) continue;
    if (!(RARITY_ORDER as readonly string[]).includes(c.rarity)) continue;
    const set = owned.get(c.primaryLanguage) ?? new Set<Rarity>();
    set.add(c.rarity as Rarity);
    owned.set(c.primaryLanguage, set);
  }
  return COLLECTION_LANGUAGES.map(language => {
    const rarities = RARITY_ORDER.filter(r => owned.get(language)?.has(r));
    return { language, owned: rarities, share: rarities.length / RARITY_ORDER.length, complete: rarities.length === RARITY_ORDER.length };
  });
}

/** What unlocks depend on. */
export interface CosmeticContext {
  level: number;
  /** Languages whose set is complete. */
  completedSets: readonly string[];
}

export interface CosmeticRule {
  id: string;
  label: string;
  /** Player-facing requirement ("Reach level 10"). */
  requirement: string;
  unlocked: (ctx: CosmeticContext) => boolean;
}

export interface TitleDef extends CosmeticRule {
  /** Tailwind text color of the title. */
  color: string;
}

export interface FrameDef extends CosmeticRule {
  /** CSS background of the ring around the avatar. */
  ring: string;
  animated?: boolean;
}

const atLevel = (level: number) => (ctx: CosmeticContext) => ctx.level >= level;
const setsDone = (count: number) => (ctx: CosmeticContext) => ctx.completedSets.length >= count;

/** Titles from levels and set counts; every completed set also gives "<Language> Collector". */
export const TITLES: readonly TitleDef[] = [
  { id: 'lvl-10', label: 'Contributor', requirement: 'Reach level 10', unlocked: atLevel(10), color: 'text-sky-300' },
  { id: 'lvl-25', label: 'Maintainer', requirement: 'Reach level 25', unlocked: atLevel(25), color: 'text-emerald-300' },
  { id: 'lvl-50', label: 'Core Team', requirement: 'Reach level 50', unlocked: atLevel(50), color: 'text-amber-300' },
  { id: 'sets-1', label: 'Completionist', requirement: 'Complete 1 language set', unlocked: setsDone(1), color: 'text-fuchsia-300' },
  { id: 'sets-3', label: 'Polyglot', requirement: 'Complete 3 language sets', unlocked: setsDone(3), color: 'text-violet-300' },
  { id: 'sets-10', label: 'Archivist', requirement: 'Complete 10 language sets', unlocked: setsDone(10), color: 'text-rose-300' },
  ...COLLECTION_LANGUAGES.map(language => ({
    id: `set-${language}`,
    label: `${language} Collector`,
    requirement: `Complete the ${language} set`,
    unlocked: (ctx: CosmeticContext) => ctx.completedSets.includes(language),
    color: 'text-indigo-200',
  })),
];

/** Rings around the avatar. */
export const FRAMES: readonly FrameDef[] = [
  { id: 'bronze', label: 'Bronze', requirement: 'Reach level 5', unlocked: atLevel(5), ring: 'linear-gradient(135deg, #b45309, #fbbf24, #78350f)' },
  { id: 'silver', label: 'Silver', requirement: 'Reach level 10', unlocked: atLevel(10), ring: 'linear-gradient(135deg, #94a3b8, #f8fafc, #475569)' },
  { id: 'gold', label: 'Gold', requirement: 'Reach level 20', unlocked: atLevel(20), ring: 'linear-gradient(135deg, #ca8a04, #fde047, #a16207)' },
  { id: 'holo', label: 'Holo', requirement: 'Reach level 35', unlocked: atLevel(35), ring: 'linear-gradient(135deg, #22d3ee, #a855f7, #f472b6, #facc15)', animated: true },
  { id: 'spectrum', label: 'Spectrum', requirement: 'Complete 1 language set', unlocked: setsDone(1), ring: 'conic-gradient(#94a3b8, #22c55e, #3b82f6, #a855f7, #f59e0b, #94a3b8)' },
  { id: 'prism', label: 'Prism', requirement: 'Complete 5 language sets', unlocked: setsDone(5), ring: 'conic-gradient(#f43f5e, #f59e0b, #84cc16, #06b6d4, #8b5cf6, #f43f5e)', animated: true },
];

export function titleById(id: string | null | undefined): TitleDef | null {
  return (id && TITLES.find(t => t.id === id)) || null;
}

export function frameById(id: string | null | undefined): FrameDef | null {
  return (id && FRAMES.find(f => f.id === id)) || null;
}

export function cosmeticContext(level: number, progress: readonly SetProgress[]): CosmeticContext {
  return { level, completedSets: progress.filter(p => p.complete).map(p => p.language) };
}

export function unlockedTitles(ctx: CosmeticContext): TitleDef[] {
  return TITLES.filter(t => t.unlocked(ctx));
}

export function unlockedFrames(ctx: CosmeticContext): FrameDef[] {
  return FRAMES.filter(f => f.unlocked(ctx));
}

/** The serializable part of a title or frame (the unlock rule stays on the server). */
export function publicTitle(t: TitleDef | null) {
  return t && { id: t.id, label: t.label, color: t.color };
}

export function publicFrame(f: FrameDef | null) {
  return f && { id: f.id, label: f.label, ring: f.ring, animated: !!f.animated };
}

export type PublicTitle = NonNullable<ReturnType<typeof publicTitle>>;
export type PublicFrame = NonNullable<ReturnType<typeof publicFrame>>;
