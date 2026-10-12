/**
 * Presentation helpers for the card face (Card.tsx): language emblem, rarity
 * pips, serial hash and title. Pure and client-safe; no game numbers here
 * (those live in battleConfig.ts / cardStats.ts).
 */

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;

/** 1 (Common) … 5 (Legendary): the lit nodes on the card's commit-graph rarity strip. */
export function rarityLevel(rarity: string): number {
  const i = (RARITY_ORDER as readonly string[]).indexOf(rarity);
  return i === -1 ? 1 : i + 1;
}

/** Emblem colour (GitHub linguist colours, darkened where white text needs it), label and text colour. */
const LANG_STYLE: Record<string, { color: string; abbr: string; ink?: string }> = {
  Python: { color: '#3572A5', abbr: 'Py' },
  JavaScript: { color: '#f1e05a', abbr: 'JS', ink: '#1a1606' },
  TypeScript: { color: '#3178c6', abbr: 'TS' },
  Ruby: { color: '#a91e2a', abbr: 'Rb' },
  PHP: { color: '#4F5D95', abbr: 'PHP' },
  Rust: { color: '#dea584', abbr: 'Rs', ink: '#2a1608' },
  C: { color: '#6e7781', abbr: 'C' },
  'C++': { color: '#f34b7d', abbr: 'C++' },
  Go: { color: '#00ADD8', abbr: 'Go' },
  Java: { color: '#b07219', abbr: 'Jv' },
  'C#': { color: '#178600', abbr: 'C#' },
  Kotlin: { color: '#A97BFF', abbr: 'Kt' },
  Swift: { color: '#F05138', abbr: 'Sw' },
  Dart: { color: '#00B4AB', abbr: 'Dt' },
  Shell: { color: '#89e051', abbr: 'Sh', ink: '#132006' },
  HTML: { color: '#e34c26', abbr: 'HT' },
  CSS: { color: '#663399', abbr: 'CSS' },
  'Jupyter Notebook': { color: '#DA5B0B', abbr: 'Jp' },
};

export function languageStyle(lang: string | null | undefined): { color: string; abbr: string; ink: string } {
  const s = lang ? LANG_STYLE[lang] : undefined;
  if (s) return { color: s.color, abbr: s.abbr, ink: s.ink ?? '#ffffff' };
  const abbr = lang && lang !== 'Unknown' ? lang.replace(/[^A-Za-z+#]/g, '').slice(0, 2) || '?' : '?';
  return { color: '#5b5872', abbr, ink: '#ffffff' };
}

/** Stable 7-char hex "commit hash" printed as the card's serial (FNV-1a of the login). */
export function serialHash(login: string): string {
  let h = 2166136261;
  for (const ch of login.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}

const RANK_BY_RARITY: Record<string, string> = {
  Common: 'Rookie',
  Uncommon: 'Hacker',
  Rare: 'Engineer',
  Epic: 'Architect',
  Legendary: 'Overlord',
};

/** Fallback when the card has no GitHub profile snapshot: "Rust Engineer", "C Overlord", "Dev Rookie". */
function rankTitle(lang: string | null | undefined, rarity: string): string {
  const who = lang && lang !== 'Unknown' ? lang.replace(' Notebook', '') : 'Dev';
  return `${who} ${RANK_BY_RARITY[rarity] ?? RANK_BY_RARITY.Common}`;
}

/** GitHub profile snapshot stored on the card (Card columns; null when never refreshed). */
export interface DevProfile {
  followers?: number | null;
  totalStars?: number | null;
  totalForks?: number | null;
  topRepoStars?: number | null;
  publicRepos?: number | null;
  publicGists?: number | null;
  languageCount?: number | null;
  githubCreatedAt?: Date | string | null;
}

/** DevProfile with the gaps filled (0) once a snapshot exists. */
type Snapshot = { [K in Exclude<keyof DevProfile, 'githubCreatedAt'>]-?: number } & { githubCreatedAt: Date | string };

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));

/**
 * One trait per thing a dev can be known for. `steps` are the four tier thresholds
 * (title i is earned at steps[i]); the strongest trait names the card.
 * `bias` lowers traits nearly everyone has (account age) so they only win when nothing else stands out;
 * a negative bias favours a trait on ties.
 */
const TRAITS: {
  key: string;
  value: (p: Snapshot, ageYears: number) => number;
  steps: [number, number, number, number];
  titles: [string, string, string, string];
  reason: (v: number) => string;
  bias?: number;
}[] = [
  {
    // One repository (1k+ stars) carries the account: >= 80% of all stars. Same scale as
    // `stars` and favoured on a tie, since it is the more specific story.
    key: 'flagship',
    value: p => (p.topRepoStars && p.totalStars && p.topRepoStars >= 1_000 && p.topRepoStars >= 0.8 * p.totalStars ? p.topRepoStars : 0),
    steps: [100, 1_000, 10_000, 50_000],
    titles: ['One-Hit Wonder', 'One-Hit Wonder', 'Flagship Builder', 'Magnum Opus'],
    reason: v => `one repo with ${compact(v)} stars`,
    bias: -0.3,
  },
  {
    key: 'stars',
    value: p => p.totalStars ?? 0,
    steps: [100, 1_000, 10_000, 50_000],
    titles: ['Star Collector', 'Star Magnet', 'Supernova', 'Galaxy Brain'],
    reason: v => `${compact(v)} stars`,
  },
  {
    key: 'followers',
    value: p => p.followers ?? 0,
    steps: [100, 1_000, 10_000, 50_000],
    titles: ['Has Fans', 'Influencer', 'Icon', 'Living Legend'],
    reason: v => `${compact(v)} followers`,
  },
  {
    key: 'forks',
    value: p => p.totalForks ?? 0,
    steps: [50, 500, 5_000, 25_000],
    titles: ['Forkable', 'Fork Magnet', 'Upstream Hero', 'Fork Empire'],
    reason: v => `${compact(v)} forks`,
  },
  {
    key: 'repos',
    value: p => p.publicRepos ?? 0,
    steps: [40, 100, 180, 280],
    titles: ['Side Hustler', 'Serial Starter', 'Repo Factory', 'Repo Hoarder'],
    reason: v => `${v} public repos`,
  },
  {
    key: 'polyglot',
    value: p => p.languageCount ?? 0,
    steps: [6, 10, 15, 22],
    titles: ['Language Tourist', 'Polyglot', 'Babel Coder', 'Omniglot'],
    reason: v => `${v} languages`,
    bias: 0.3, // grows with the repo count anyway
  },
  {
    key: 'gists',
    value: p => p.publicGists ?? 0,
    steps: [10, 50, 150, 400],
    titles: ['Snippet Keeper', 'Copy-Paste Artisan', 'Gist Librarian', 'Gist Archmage'],
    reason: v => `${v} gists`,
  },
  {
    key: 'age',
    value: (_p, ageYears) => ageYears,
    steps: [5, 10, 14, 17],
    titles: ['Seasoned', 'Veteran', 'Pre-Cloud Elder', 'Remembers SVN'],
    reason: v => `on GitHub for ${Math.floor(v)} years`,
    bias: 0.5,
  },
];

/**
 * Funny combinations that beat any trait up to tier 2 (a famous dev's real fame still wins).
 * Checked in order; the first match is the candidate.
 */
const QUIRKS: { title: string; score: number; when: (p: Snapshot, ageYears: number) => string | null }[] = [
  { title: 'Side Project Graveyard', score: 2.6, when: p => (p.publicRepos >= 60 && p.totalStars < p.publicRepos / 2 ? `${p.publicRepos} repos, ${p.totalStars} stars` : null) },
  { title: 'Fork Bomb', score: 2.6, when: p => (p.totalForks >= 100 && p.totalForks > p.totalStars ? `${compact(p.totalForks)} forks, only ${compact(p.totalStars)} stars` : null) },
  { title: 'Social Butterfly', score: 2.6, when: p => (p.followers >= 300 && p.totalStars < 30 ? `${compact(p.followers)} followers, ${p.totalStars} stars` : null) },
  { title: 'Ancient Lurker', score: 2.4, when: (p, age) => (age >= 12 && p.publicRepos <= 3 ? `${Math.floor(age)} years on GitHub, ${p.publicRepos} repo${p.publicRepos === 1 ? '' : 's'}` : null) },
];

/** Inside jokes for quiet profiles, per language, plus a generic pool. Picked by the login hash, so stable per dev. */
const LANGUAGE_JOKES: Record<string, string[]> = {
  JavaScript: ['undefined Is Not a Function', 'npm install Everything'],
  TypeScript: ['any Abuser', '@ts-ignore Enjoyer'],
  Python: ['Indentation Enforcer', 'pip install Wizard'],
  Rust: ['Borrow Checker Victim', 'Rewrite It in Rust'],
  Go: ['if err != nil', 'Gopher Wrangler'],
  C: ['Segfault Survivor', 'malloc Without free'],
  'C++': ['Template Wizard', 'Undefined Behavior Fan'],
  Java: ['AbstractFactoryBean', 'Enterprise Edition'],
  'C#': ['NullReference Hunter', 'Visual Studio Loyalist'],
  PHP: ['Still on PHP 5', '$ Sign Collector'],
  Ruby: ['Monkey Patcher', 'Rails Rider'],
  Kotlin: ['!! Enthusiast', 'Escaped From Java'],
  Swift: ['Xcode Hostage', 'Optional Unwrapper'],
  Dart: ['Widget Stacker', 'Hot Reload Addict'],
  Shell: ['rm -rf Survivor', 'sudo Make Me a Sandwich'],
  HTML: ['Is HTML a Language?', '<div> Nester'],
  CSS: ['Center That Div', '!important Abuser'],
  'Jupyter Notebook': ['Run All Cells', 'Notebook Necromancer'],
};
const GENERIC_JOKES = [
  'Works On My Machine', 'Hello World Survivor', 'Stack Overflow Tourist', 'Professional Googler',
  'Commit Message: fix', 'console.log Debugger', 'README Skimmer', 'Tab Hoarder',
];

/** Tier reached (0–4) plus the log-scale progress towards the next one, so ties break on how far past the threshold a dev is. */
function traitScore(value: number, steps: readonly number[]): number {
  let level = 0;
  while (level < steps.length && value >= steps[level]) level++;
  if (level === 0) return 0;
  const lo = steps[level - 1];
  const hi = level < steps.length ? steps[level] : steps[steps.length - 1] * 4;
  return level + Math.min(0.99, Math.log(value / lo) / Math.log(hi / lo));
}

/**
 * Card title from the dev's real GitHub profile ("Supernova", "Side Project Graveyard",
 * "Remembers SVN"…) with the reason behind it. Quiet profiles get a language joke
 * ("Borrow Checker Victim"); cards without a profile snapshot keep language + rank.
 */
export function cardTitle(
  profile: DevProfile | null | undefined,
  lang: string | null | undefined,
  rarity: string,
  login = '',
  now: number = Date.now(),
): { title: string; reason: string | null } {
  if (!profile?.githubCreatedAt) return { title: rankTitle(lang, rarity), reason: null };
  const p = {
    followers: profile.followers ?? 0,
    totalStars: profile.totalStars ?? 0,
    totalForks: profile.totalForks ?? 0,
    topRepoStars: profile.topRepoStars ?? 0,
    publicRepos: profile.publicRepos ?? 0,
    publicGists: profile.publicGists ?? 0,
    languageCount: profile.languageCount ?? 0,
    githubCreatedAt: profile.githubCreatedAt,
  } as Snapshot;
  const ageYears = Math.max(0, (now - new Date(p.githubCreatedAt as Date | string).getTime()) / (365.25 * 24 * 3600 * 1000));

  let best: { score: number; title: string; reason: string } | null = null;
  for (const t of TRAITS) {
    const v = t.value(p, ageYears);
    const raw = traitScore(v, t.steps);
    if (raw === 0) continue;
    const score = raw - (t.bias ?? 0);
    if (!best || score > best.score) {
      best = { score, title: t.titles[Math.floor(raw) - 1], reason: t.reason(v) };
    }
  }
  for (const q of QUIRKS) {
    const reason = q.when(p, ageYears);
    if (reason === null) continue;
    if (!best || q.score > best.score) best = { score: q.score, title: q.title, reason };
    break;
  }
  if (best) return { title: best.title, reason: best.reason };
  if (ageYears < 1) return { title: 'Fresh Commit', reason: 'joined GitHub this year' };
  const jokes = [...(lang ? LANGUAGE_JOKES[lang] ?? [] : []), ...GENERIC_JOKES];
  return { title: jokes[parseInt(serialHash(login || 'dev'), 16) % jokes.length], reason: 'a quiet GitHub profile' };
}
