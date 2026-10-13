/**
 * The Tower (pure, client-safe): 10 floors of computer teams that get harder,
 * a mini-boss on floor 5 and a Legendary boss on floor 10. Every week (Monday
 * 00:00 UTC) the tower gets a language theme and new teams, the same for every
 * player, so the weekly ranking (highest floor, then fewest attempts) is fair.
 */
import type { Rarity } from './rarity';

export interface TowerFloor {
  floor: number;
  /** Rarity of each of the 3 opponent cards. */
  rarities: [Rarity, Rarity, Rarity];
  /** BITS for the first clear of the floor in the week. */
  rewardBits: number;
  boss?: 'mini' | 'final';
}

export const TOWER_FLOORS: readonly TowerFloor[] = [
  { floor: 1, rarities: ['Common', 'Common', 'Common'], rewardBits: 40 },
  { floor: 2, rarities: ['Common', 'Common', 'Uncommon'], rewardBits: 50 },
  { floor: 3, rarities: ['Uncommon', 'Uncommon', 'Uncommon'], rewardBits: 60 },
  { floor: 4, rarities: ['Uncommon', 'Uncommon', 'Rare'], rewardBits: 80 },
  { floor: 5, rarities: ['Rare', 'Rare', 'Rare'], rewardBits: 200, boss: 'mini' },
  { floor: 6, rarities: ['Rare', 'Rare', 'Epic'], rewardBits: 100 },
  { floor: 7, rarities: ['Rare', 'Epic', 'Epic'], rewardBits: 120 },
  { floor: 8, rarities: ['Epic', 'Epic', 'Epic'], rewardBits: 150 },
  { floor: 9, rarities: ['Epic', 'Epic', 'Legendary'], rewardBits: 200 },
  { floor: 10, rarities: ['Legendary', 'Legendary', 'Legendary'], rewardBits: 600, boss: 'final' },
];

export const TOWER_TOP_FLOOR = TOWER_FLOORS.length;

/** Weekly themes, in rotation: opponents come from this language when there are enough cards. */
export const TOWER_THEMES = ['Rust', 'Go', 'Python', 'TypeScript', 'JavaScript', 'Java', 'C++', 'Ruby', 'C#', 'PHP'] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function themeForWeek(weekStart: Date): string {
  const index = Math.floor(weekStart.getTime() / WEEK_MS);
  return TOWER_THEMES[((index % TOWER_THEMES.length) + TOWER_THEMES.length) % TOWER_THEMES.length];
}

export function towerName(theme: string): string {
  return `The ${theme} Gauntlet`;
}

export function floorTitle(f: TowerFloor, theme: string): string {
  if (f.boss === 'final') return `Floor ${f.floor} · ${theme} Legends (final boss)`;
  if (f.boss === 'mini') return `Floor ${f.floor} · ${theme} Elite (mini-boss)`;
  return `Floor ${f.floor}`;
}

/** Deterministic pseudo-random numbers in [0, 1) from a text seed (FNV-1a + mulberry32). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks `count` distinct items with a seeded shuffle (same seed, same picks). */
export function seededPick<T>(items: readonly T[], count: number, seed: string): T[] {
  const rng = seededRandom(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/** Weekly ranking order: higher floor first, then fewer attempts, then who got there first. */
export function compareTowerRuns(
  a: { cleared: number; attempts: number; updatedAt: Date },
  b: { cleared: number; attempts: number; updatedAt: Date },
): number {
  return b.cleared - a.cleared || a.attempts - b.attempts || a.updatedAt.getTime() - b.updatedAt.getTime();
}
