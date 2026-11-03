/**
 * Developers who asked to leave the game (pure, client-safe). Their card keeps
 * its stats, rarity and language for the players who own it, but loses
 * everything that identifies the person; see devRemovalService.ts for where
 * they are kept out of the game.
 */

export const ANONYMOUS_DEV_NAME = 'Anonymous Dev';
export const ANONYMOUS_DEV_FLAVOR = 'This developer asked to leave GitGacha. The card keeps its stats.';
/** Served from /public: screens that fall back to the GitHub avatar of the login never see an empty one. */
export const ANONYMOUS_DEV_AVATAR = '/anonymous-dev.svg';

/** The `githubUsername` an anonymized card gets (the column is unique, and no GitHub login has a "~"). */
export function anonymousLogin(cardId: string): string {
  return `~removed-${cardId}`;
}

/** An anonymized card: no @login, no GitHub link, no public card page. */
export function isAnonymousLogin(login: string | null | undefined): boolean {
  return !!login?.startsWith('~');
}

/** Numeric GitHub id from an avatar URL (https://avatars.githubusercontent.com/u/<id>?v=4), when it has one. */
export function githubIdFromAvatar(url: string | null | undefined): number | null {
  const m = url?.match(/avatars\.githubusercontent\.com\/u\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface RemovedDevs {
  logins: Set<string>; // lower-case
  ids: Set<number>;
}

/** True when a drawn or fetched developer is one who left (same login, or same GitHub id after a rename). */
export function isRemovedDev(dev: { githubUsername: string; avatarUrl?: string | null }, removed: RemovedDevs): boolean {
  if (removed.logins.has(dev.githubUsername.toLowerCase())) return true;
  const id = githubIdFromAvatar(dev.avatarUrl);
  return id !== null && removed.ids.has(id);
}

/** Card columns that identify the developer, cleared. Stats, rarity and language stay. */
export function anonymizedCardData(cardId: string) {
  return {
    githubUsername: anonymousLogin(cardId),
    name: ANONYMOUS_DEV_NAME,
    avatarUrl: ANONYMOUS_DEV_AVATAR,
    flavorText: ANONYMOUS_DEV_FLAVOR,
    followers: null,
    totalStars: null,
    totalForks: null,
    topRepoStars: null,
    publicRepos: null,
    publicGists: null,
    languageCount: null,
    githubCreatedAt: null,
  };
}

type Json = unknown;

/**
 * A stored battle (teams, stats, log) with a removed developer's name and
 * avatar replaced, for public replays. Team entries are matched by avatar
 * (or by name when the entry has no avatar); the name is then replaced in the
 * stats and in every sentence and value of the log. Returns null when the
 * developer isn't in the battle.
 */
export function scrubBattle(
  battle: { challengerTeam: Json; defenderTeam: Json; battleStats: Json; log: Json },
  dev: { name: string; avatarUrl: string | null },
): { challengerTeam: Json; defenderTeam: Json; battleStats: Json; log: Json } | null {
  const isDev = (c: { name?: unknown; avatarUrl?: unknown }) =>
    dev.avatarUrl ? c.avatarUrl === dev.avatarUrl : c.name === dev.name;
  let found = false;
  const scrubTeam = (team: Json) => Array.isArray(team)
    ? team.map(c => {
      if (!c || typeof c !== 'object' || !isDev(c)) return c;
      found = true;
      return { ...c, name: ANONYMOUS_DEV_NAME, avatarUrl: ANONYMOUS_DEV_AVATAR };
    })
    : team;
  const challengerTeam = scrubTeam(battle.challengerTeam);
  const defenderTeam = scrubTeam(battle.defenderTeam);
  if (!found) return null;

  const replaceName = (s: string) => s.split(dev.name).join(ANONYMOUS_DEV_NAME);
  const deep = (v: Json): Json => {
    if (typeof v === 'string') return replaceName(v);
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
    return v;
  };
  const battleStats = Array.isArray(battle.battleStats)
    ? battle.battleStats.map(s => (s && typeof s === 'object' && (s as { name?: unknown }).name === dev.name ? { ...s, name: ANONYMOUS_DEV_NAME } : s))
    : battle.battleStats;
  return { challengerTeam, defenderTeam, battleStats, log: dev.name ? deep(battle.log) : battle.log };
}
