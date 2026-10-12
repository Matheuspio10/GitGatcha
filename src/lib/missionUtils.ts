import { RARITY_ORDER, isRarity } from './rarity';

/**
 * Pure daily-mission logic (no Prisma), shared by the server and the store UI.
 *
 * Mission `targetValue` formats:
 * - OPEN_BOOSTER / WIN_BATTLE: the count, e.g. "3"
 * - COLLECT_RARITY: a minimum rarity, optionally with a count, e.g. "Rare" or "Uncommon:3"
 * - COLLECT_LANGUAGE: a language, optionally with a count, e.g. "Python" or "Python:2"
 */

export type MissionType = 'OPEN_BOOSTER' | 'WIN_BATTLE' | 'COLLECT_RARITY' | 'COLLECT_LANGUAGE';

export interface MissionDefinition {
  description: string;
  type: MissionType;
  reward: number;
  targetValue: string;
}

export const DAILY_MISSION_COUNT = 3;

export const MISSION_POOL: MissionDefinition[] = [
  { description: 'Open 2 Boosters', type: 'OPEN_BOOSTER', reward: 150, targetValue: '2' },
  { description: 'Open 3 Boosters', type: 'OPEN_BOOSTER', reward: 300, targetValue: '3' },
  { description: 'Open 5 Boosters', type: 'OPEN_BOOSTER', reward: 500, targetValue: '5' },
  { description: 'Win a Battle', type: 'WIN_BATTLE', reward: 100, targetValue: '1' },
  { description: 'Win 2 Battles', type: 'WIN_BATTLE', reward: 200, targetValue: '2' },
  { description: 'Win 4 Battles', type: 'WIN_BATTLE', reward: 400, targetValue: '4' },
  { description: 'Collect 3 Uncommon or better Cards', type: 'COLLECT_RARITY', reward: 100, targetValue: 'Uncommon:3' },
  { description: 'Collect a Rare or better Card', type: 'COLLECT_RARITY', reward: 150, targetValue: 'Rare' },
  { description: 'Collect an Epic or better Card', type: 'COLLECT_RARITY', reward: 300, targetValue: 'Epic' },
  { description: 'Get a Python Dev', type: 'COLLECT_LANGUAGE', reward: 150, targetValue: 'Python' },
  { description: 'Get a JavaScript Dev', type: 'COLLECT_LANGUAGE', reward: 150, targetValue: 'JavaScript' },
  { description: 'Get a TypeScript Dev', type: 'COLLECT_LANGUAGE', reward: 150, targetValue: 'TypeScript' },
  { description: 'Get an HTML Dev', type: 'COLLECT_LANGUAGE', reward: 150, targetValue: 'HTML' },
  { description: 'Get a Java Dev', type: 'COLLECT_LANGUAGE', reward: 150, targetValue: 'Java' },
  { description: 'Get a Go Dev', type: 'COLLECT_LANGUAGE', reward: 200, targetValue: 'Go' },
  { description: 'Get a Rust Dev', type: 'COLLECT_LANGUAGE', reward: 200, targetValue: 'Rust' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the day that contains `date`. */
export function utcDayStart(date: Date): Date {
  return new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);
}

/** When the daily missions next refresh (next midnight UTC). */
export function nextMissionReset(now: Date = new Date()): Date {
  return new Date(utcDayStart(now).getTime() + DAY_MS);
}

/**
 * A player's missions belong to the UTC day they were assigned on. They need a
 * fresh set when they have none, or when any of them is from a previous day.
 */
export function needsNewMissions(assignedAt: Date[], now: Date = new Date()): boolean {
  if (assignedAt.length === 0) return true;
  const today = utcDayStart(now).getTime();
  return assignedAt.some(d => d.getTime() < today);
}

/** Splits "Rare:3" into { value: "Rare", count: 3 }; a plain value counts once. */
export function parseCollectTarget(targetValue: string | null | undefined): { value: string | null; count: number } {
  if (!targetValue) return { value: null, count: 1 };
  const match = targetValue.match(/^(.*):(\d+)$/);
  if (match) return { value: match[1], count: Math.max(1, parseInt(match[2], 10)) };
  return { value: targetValue, count: 1 };
}

/** How many qualifying events complete the mission. */
export function missionRequiredCount(type: string, targetValue: string | null | undefined): number {
  if (type === 'COLLECT_RARITY' || type === 'COLLECT_LANGUAGE') return parseCollectTarget(targetValue).count;
  const n = parseInt(targetValue || '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** True when `cardRarity` is `targetRarity` or higher (an Epic pull completes "Collect a Rare"). */
export function rarityMeetsTarget(cardRarity: string | null | undefined, targetRarity: string | null | undefined): boolean {
  if (!isRarity(cardRarity) || !isRarity(targetRarity)) return false;
  return RARITY_ORDER.indexOf(cardRarity) >= RARITY_ORDER.indexOf(targetRarity);
}

/** Whether a progress event (`eventValue` = card rarity / language) counts toward a mission. */
export function missionMatchesEvent(type: string, targetValue: string | null | undefined, eventValue?: string): boolean {
  if (type === 'COLLECT_RARITY') {
    const { value } = parseCollectTarget(targetValue);
    return value === null || rarityMeetsTarget(eventValue, value);
  }
  if (type === 'COLLECT_LANGUAGE') {
    const { value } = parseCollectTarget(targetValue);
    return value === null || (!!eventValue && eventValue.toLowerCase() === value.toLowerCase());
  }
  // Count-based missions (OPEN_BOOSTER, WIN_BATTLE): every event counts
  return true;
}

/**
 * Picks `count` missions, preferring distinct types so a day is never e.g. three
 * "open boosters" missions. `randomIndex(n)` returns an integer in [0, n).
 */
export function pickDailyMissions<T extends { type: string }>(
  pool: readonly T[],
  count: number,
  randomIndex: (n: number) => number,
): T[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picked: T[] = [];
  const usedTypes = new Set<string>();
  for (const m of shuffled) {
    if (picked.length >= count) break;
    if (!usedTypes.has(m.type)) {
      picked.push(m);
      usedTypes.add(m.type);
    }
  }
  for (const m of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked;
}
