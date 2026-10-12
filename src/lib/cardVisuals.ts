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

/** "Rust Engineer", "C Overlord", "Dev Rookie": language + rank by rarity. */
export function cardTitle(lang: string | null | undefined, rarity: string): string {
  const who = lang && lang !== 'Unknown' ? lang.replace(' Notebook', '') : 'Dev';
  return `${who} ${RANK_BY_RARITY[rarity] ?? RANK_BY_RARITY.Common}`;
}
