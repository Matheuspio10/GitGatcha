/**
 * Sprints (pure, client-safe): a daily and a weekly competition with a theme.
 * Nobody builds anything: when a sprint ends, every player is scored by the
 * power (ATK + DEF + HP) of their best cards of the theme, computed live from
 * their collection. Ties share the position (1, 1, 3) and the top pays BITS.
 */
import { utcDayStart, utcWeekStart } from './missionUtils';

export type SprintKind = 'daily' | 'weekly';

export interface SprintTheme {
  /** Stored on the Sprint row ("lang:Rust", "family:web"), so past sprints keep their theme. */
  id: string;
  name: string;
  /** Cards whose primary language is one of these count. */
  languages: string[];
}

/** How many of a player's best theme cards make up their score (a battle team). */
export const SPRINT_TEAM_SIZE = 3;

/** Daily themes, in rotation (the languages with the most cards in the game). */
export const DAILY_SPRINT_LANGUAGES = [
  'JavaScript', 'Python', 'TypeScript', 'C', 'Java', 'C++', 'HTML', 'PHP',
  'Ruby', 'Go', 'C#', 'Rust', 'CSS', 'Swift', 'Shell',
] as const;

/** Weekly themes, in rotation: families of languages, so more players take part. */
export const WEEKLY_SPRINT_FAMILIES: readonly SprintTheme[] = [
  { id: 'family:web', name: 'Web Week', languages: ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue', 'Svelte'] },
  { id: 'family:systems', name: 'Systems Week', languages: ['C', 'C++', 'Rust', 'Go', 'Zig', 'Assembly'] },
  { id: 'family:data', name: 'Data Week', languages: ['Python', 'Jupyter Notebook', 'R', 'Julia'] },
  { id: 'family:enterprise', name: 'JVM & .NET Week', languages: ['Java', 'Kotlin', 'Scala', 'C#', 'F#'] },
  { id: 'family:scripting', name: 'Scripting Week', languages: ['Ruby', 'PHP', 'Shell', 'Lua', 'Perl'] },
  { id: 'family:mobile', name: 'Mobile Week', languages: ['Swift', 'Kotlin', 'Dart', 'Objective-C'] },
];

/**
 * BITS by final position. Each row pays every position up to `upTo`; tied
 * players share the position, so they get the same reward.
 */
export const SPRINT_REWARDS: Record<SprintKind, readonly { upTo: number; bits: number }[]> = {
  daily: [
    { upTo: 1, bits: 200 },
    { upTo: 2, bits: 120 },
    { upTo: 3, bits: 80 },
    { upTo: 10, bits: 30 },
  ],
  weekly: [
    { upTo: 1, bits: 1000 },
    { upTo: 2, bits: 600 },
    { upTo: 3, bits: 400 },
    { upTo: 10, bits: 150 },
  ],
};

/** Results kept per sprint (every paid player is within it). */
export const SPRINT_RESULTS_KEPT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function sprintKindLabel(kind: SprintKind): string {
  return kind === 'daily' ? 'Daily Sprint' : 'Weekly Sprint';
}

export function languageTheme(language: string): SprintTheme {
  return { id: `lang:${language}`, name: `${language} Day`, languages: [language] };
}

/** The theme stored on a sprint row; unknown ids (a family removed later) fall back to a language. */
export function sprintThemeById(id: string): SprintTheme {
  const family = WEEKLY_SPRINT_FAMILIES.find(f => f.id === id);
  if (family) return family;
  return languageTheme(id.startsWith('lang:') ? id.slice(5) : id);
}

export function sprintThemeFor(kind: SprintKind, startsAt: Date): SprintTheme {
  if (kind === 'daily') {
    const index = Math.floor(startsAt.getTime() / DAY_MS);
    return languageTheme(DAILY_SPRINT_LANGUAGES[mod(index, DAILY_SPRINT_LANGUAGES.length)]);
  }
  const index = Math.floor(startsAt.getTime() / WEEK_MS);
  return WEEKLY_SPRINT_FAMILIES[mod(index, WEEKLY_SPRINT_FAMILIES.length)];
}

export interface SprintPeriod {
  id: string;
  kind: SprintKind;
  startsAt: Date;
  endsAt: Date;
  theme: SprintTheme;
}

/** The sprint of `kind` running at `now`: daily from midnight UTC, weekly from Monday 00:00 UTC. */
export function sprintPeriod(kind: SprintKind, now: Date): SprintPeriod {
  const startsAt = kind === 'daily' ? utcDayStart(now) : utcWeekStart(now);
  const endsAt = new Date(startsAt.getTime() + (kind === 'daily' ? DAY_MS : WEEK_MS));
  return { id: `${kind}:${startsAt.toISOString().slice(0, 10)}`, kind, startsAt, endsAt, theme: sprintThemeFor(kind, startsAt) };
}

/**
 * Competition ranking of rows already sorted by score (highest first): tied
 * scores share the position and the next one skips (1, 1, 3).
 */
export function rankWithTies<T extends { score: number }>(sorted: readonly T[]): (T & { position: number })[] {
  const ranked: (T & { position: number })[] = [];
  sorted.forEach((row, i) => {
    const tied = i > 0 && sorted[i - 1].score === row.score;
    ranked.push({ ...row, position: tied ? ranked[i - 1].position : i + 1 });
  });
  return ranked;
}

export function sprintRewardFor(kind: SprintKind, position: number): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  return SPRINT_REWARDS[kind].find(r => position <= r.upTo)?.bits ?? 0;
}

/** "1st 200 · 2nd 120 · 3rd 80 · 4th–10th 30" */
export function sprintRewardsLegend(kind: SprintKind): string {
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  let from = 1;
  return SPRINT_REWARDS[kind].map(r => {
    const label = r.upTo === from ? ordinal(from) : `${ordinal(from)}–${ordinal(r.upTo)}`;
    from = r.upTo + 1;
    return `${label} ${r.bits}`;
  }).join(' · ');
}
