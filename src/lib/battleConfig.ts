/**
 * Single source of truth for battle economy and battle constants.
 *
 * Imported by the server (battle routes, battleService, loyaltyService,
 * battleResolver) AND by client pages (TeamBuilder, Wiki), so it must stay
 * free of server-only imports (no prisma, no node modules).
 */

import { RARITY_ORDER } from './rarity';

// ─── Leagues ──────────────────────────────────────────────────────────────────

export const LEAGUE_MODES = ['OPEN', 'RANKED', 'COMMON', 'BALANCED', 'DIVERSITY', 'LEGENDARY'] as const;
export type LeagueMode = (typeof LEAGUE_MODES)[number];

export function isLeagueMode(value: unknown): value is LeagueMode {
  return typeof value === 'string' && (LEAGUE_MODES as readonly string[]).includes(value);
}

export interface LeagueRules {
  label: string;
  /** Short, player-facing description of the entry restrictions. */
  rules: string;
  winBits: number;
  winXp: number;
  lossBits: number;
  lossXp: number;
  /** BITS charged before the battle starts (not refunded on a loss). */
  entryFee: number;
  /** Rarities allowed in the team (and in the computer's team). Undefined = any. */
  allowedRarities?: readonly string[];
}

/** Balanced League: team power (ATK + DEF + HP of the 3 cards) may not exceed average card power × this. */
export const BALANCED_POWER_CAP_MULTIPLIER = 3;

export const LEAGUES: Record<LeagueMode, LeagueRules> = {
  OPEN: {
    label: 'Open League',
    rules: 'No restrictions — use any cards.',
    winBits: 50, winXp: 80, lossBits: 10, lossXp: 30, entryFee: 0,
  },
  // Ranked: the opponent is the saved active team of a player near your rating
  // ("ghost" PvP). The only league that moves the rating and the rank (ranks.ts).
  RANKED: {
    label: 'Ranked',
    rules: "Fight the saved team of a player near your rating. Rating and rank change; they don't have to be online.",
    winBits: 60, winXp: 100, lossBits: 10, lossXp: 30, entryFee: 0,
  },
  COMMON: {
    label: 'Common League',
    rules: 'Common & Uncommon cards only.',
    winBits: 80, winXp: 100, lossBits: 10, lossXp: 30, entryFee: 0,
    allowedRarities: ['Common', 'Uncommon'],
  },
  BALANCED: {
    label: 'Balanced League',
    rules: `Team power (ATK + DEF + HP) cannot exceed ${BALANCED_POWER_CAP_MULTIPLIER}× the average card power.`,
    winBits: 100, winXp: 120, lossBits: 10, lossXp: 30, entryFee: 0,
  },
  // Note: Diversity pays more than Balanced but has no stat cap — a team of 3
  // Legendaries with different languages qualifies. Kept as is on purpose
  // (ROADMAP 1.4); revisit when balancing the economy.
  DIVERSITY: {
    label: 'Diversity League',
    rules: '3 different primary languages required.',
    winBits: 120, winXp: 140, lossBits: 10, lossXp: 30, entryFee: 0,
  },
  // The entry fee is paid up front and only refunded when the battle could not
  // be saved (api/battle/route.ts). A win must be net
  // positive (900 − 500 = +400 BITS) to justify the risk; a loss pays nothing
  // (−500 BITS). Before this the win paid 300, so the league always lost money.
  LEGENDARY: {
    label: 'Legendary Only',
    rules: 'Legendary cards only.',
    winBits: 900, winXp: 200, lossBits: 0, lossXp: 30, entryFee: 500,
    allowedRarities: ['Legendary'],
  },
};

/** BITS for a player whose saved team wins when someone attacks it in Ranked. */
export const RANKED_DEFENSE_WIN_BITS = 20;
/** A player's last N Ranked opponents are skipped when finding the next one (when possible). */
export const RANKED_RECENT_OPPONENTS = 3;

/** Most BITS each player can put in a friend challenge (the winner takes both stakes). */
export const CHALLENGE_STAKE_MAX = 500;
/** Hours a challenge waits for an answer before it expires (stakes go back). */
export const CHALLENGE_TTL_HOURS = 24;

/** Friend challenges always use these rewards (no entry fee, no restrictions). */
export const FRIEND_BATTLE_LEAGUE: LeagueMode = 'OPEN';

export function getLeagueRewards(leagueMode: string, didWin: boolean): { bits: number; xp: number } {
  const league = LEAGUES[isLeagueMode(leagueMode) ? leagueMode : 'OPEN'];
  return didWin
    ? { bits: league.winBits, xp: league.winXp }
    : { bits: league.lossBits, xp: league.lossXp };
}

// ─── Upset bonus ──────────────────────────────────────────────────────────────

/**
 * Beating a team of higher average rarity pays more BITS (XP is unchanged):
 * +25% per rarity tier of difference, up to +100%. Upsets are rare (a full
 * Common team beats a full Uncommon one ~18% of the time), so this rewards
 * weaker collections without inflating the economy.
 */
export const UPSET_BONUS = { perTier: 0.25, max: 1 } as const;

/** Average rarity tier of a team: 0 (Common) to 4 (Legendary). */
export function teamRarityTier(team: readonly { rarity: string }[]): number {
  if (team.length === 0) return 0;
  const tier = (r: string) => Math.max(0, (RARITY_ORDER as readonly string[]).indexOf(r));
  return team.reduce((sum, c) => sum + tier(c.rarity), 0) / team.length;
}

/** Upset bonus of the winning team (0 when it wasn't the underdog), in whole percents as a fraction. */
export function upsetBonusPct(winnerTeam: readonly { rarity: string }[], loserTeam: readonly { rarity: string }[]): number {
  const gap = teamRarityTier(loserTeam) - teamRarityTier(winnerTeam);
  if (gap <= 0) return 0;
  return Math.round(Math.min(UPSET_BONUS.max, gap * UPSET_BONUS.perTier) * 100) / 100;
}

export interface BattleRewards {
  bits: number;
  xp: number;
  /** Extra BITS share for beating a stronger team (0.25 = +25%); only on a win. */
  upsetBonusPct?: number;
}

/** Adds the upset bonus to a win's BITS. */
export function withUpsetBonus(rewards: { bits: number; xp: number }, bonusPct: number): BattleRewards {
  if (bonusPct <= 0) return rewards;
  return { ...rewards, bits: Math.round(rewards.bits * (1 + bonusPct)), upsetBonusPct: bonusPct };
}

// ─── Stamina ──────────────────────────────────────────────────────────────────

/** Stamina spent by every card that takes part in a battle (PvE or PvP). */
export const STAMINA_COST_PER_BATTLE = 20;

// ─── Rating (PvP only) ────────────────────────────────────────────────────────

export const STARTING_RATING = 1000;
export const RATING_K_FACTOR = 32;

// ─── Damage ───────────────────────────────────────────────────────────────────

/**
 * Percent mitigation: damage = ATK × K / (K + DEF). DEF = K halves the damage,
 * DEF = 3K blocks 75%. Diminishing returns, so stacking DEF never makes a card
 * immune — and DEF always matters, not only for repo spammers.
 */
export const DEF_MITIGATION_K = 100;
/** DEF never blocks more than this share of a hit (the damage floor). */
export const MAX_DEF_MITIGATION = 0.75;

export function defMitigation(def: number): number {
  const d = Math.max(0, def);
  return Math.min(MAX_DEF_MITIGATION, d / (DEF_MITIGATION_K + d));
}

/** Momentum: +10% ATK and DEF per stack (max 2 stacks reachable, capped at 3). */
export const MOMENTUM_BONUS_PER_STACK = 0.1;

/** A single matchup that lasts this many turns is decided by remaining HP %. */
export const MATCHUP_TURN_CAP = 50;

// ─── Language types ───────────────────────────────────────────────────────────

/** Languages with a combat type, a passive and type matchups. Everything else is Neutral. */
export const COMBAT_LANGUAGES = [
  'Python', 'JavaScript', 'TypeScript', 'Ruby', 'PHP',
  'Rust', 'C', 'C++', 'Go',
  'Java', 'C#', 'Kotlin', 'Swift', 'Dart',
  'Shell', 'HTML', 'CSS', 'Jupyter Notebook',
] as const;
export type CombatLanguage = (typeof COMBAT_LANGUAGES)[number];

export function isCombatLanguage(lang: unknown): lang is CombatLanguage {
  return typeof lang === 'string' && (COMBAT_LANGUAGES as readonly string[]).includes(lang);
}

export const TYPE_ADVANTAGE_MULTIPLIER = 1.5;
export const TYPE_DISADVANTAGE_MULTIPLIER = 0.75;

/**
 * Who deals 1.5× damage to whom (the target deals 0.75× back). Every typed
 * language beats something and (except TypeScript) loses to something:
 *
 * - Web cycle:     Python → JavaScript → Ruby → PHP → Python; TypeScript → JavaScript
 * - Systems:       Rust → C / C++ → Go → Rust
 * - JVM / .NET:    Kotlin → Java → C# → Kotlin
 * - Mobile:        Swift → Kotlin → Dart → Swift
 * - Scripting:     Python → Shell → Java → Jupyter Notebook → Shell
 * - Markup:        JavaScript / PHP → HTML → CSS (CSS also deals 0.75× to every typed language)
 */
export const TYPE_ADVANTAGES: Partial<Record<CombatLanguage, readonly CombatLanguage[]>> = {
  Python: ['JavaScript', 'Shell'],
  JavaScript: ['Ruby', 'HTML'],
  Ruby: ['PHP'],
  PHP: ['Python', 'HTML'],
  TypeScript: ['JavaScript'],
  Rust: ['C', 'C++'],
  C: ['Go'],
  'C++': ['Go'],
  Go: ['Rust'],
  Java: ['C#', 'Jupyter Notebook'],
  'C#': ['Kotlin'],
  Kotlin: ['Java', 'Dart'],
  Swift: ['Kotlin'],
  Dart: ['Swift'],
  Shell: ['Java'],
  'Jupyter Notebook': ['Shell'],
  HTML: ['CSS'],
};

/** Languages that `lang` is weak against (derived from TYPE_ADVANTAGES). */
export function typeWeaknesses(lang: CombatLanguage): CombatLanguage[] {
  return COMBAT_LANGUAGES.filter(other => TYPE_ADVANTAGES[other]?.includes(lang));
}

// ─── Passives ─────────────────────────────────────────────────────────────────

/**
 * Scales the trigger chance of random passives (CSS double damage, JS Double
 * Callback, C# Critical Hit, Swift Dodge) by card rarity. Rare is the baseline.
 * Kept narrow so passives add surprise without becoming another rarity multiplier.
 * Bad luck (CSS zero damage) is DIVIDED by it, so it gets rarer on rarer cards.
 */
export const PASSIVE_RARITY_MULTIPLIER: Record<string, number> = {
  Common: 0.9,
  Uncommon: 0.95,
  Rare: 1.0,
  Epic: 1.05,
  Legendary: 1.1,
};

/** Numbers behind every passive and synergy (the Wiki renders its texts from these). */
export const PASSIVE = {
  python: { regenAtkPct: 0.10 },
  jupyter: { regenAtkPct: 0.08 },
  javascript: { chance: 0.3, bonus: 0.5 },
  typescript: { damageTaken: 0.88 },
  ruby: { hpThreshold: 0.3, atkMult: 1.5 },
  php: { survivesAt: 1 },
  rawPower: { defIgnored: 0.4 },
  css: { doubleChance: 0.3, zeroChance: 0.1 },
  java: { firstTurnMult: 0.9, perTurn: 0.05, maxBonus: 0.25 },
  csharp: { chance: 0.15, critMult: 1.75 },
  kotlin: { maxHpPctPerTurn: 0.3 },
  swift: { dodgeChance: 0.12 },
  shell: { every: 3, mult: 2 },
  html: { hpThreshold: 0.5, damageTaken: 0.75 },
  dart: { hpThreshold: 0.3, healMaxHpPct: 0.2 },
} as const;

export const SYNERGY = {
  mixedTeamAtk: 0.08,
  pythonRegenAtkPct: 0.06, // 12% with 3 Python cards; each card heals at the higher of this and its own rate
  rustDamageReduction: 0.10, // 20% with 3 Rust cards
  jsCallbackChance: 0.10, // non-JS teammates (20% with 3 JS cards)
} as const;

/** 0.4 → "40%" (also used to fill translated passive texts). */
export const pctText = (x: number) => `${Math.round(x * 100)}%`;
/** "20% (Common) to 30% (Legendary)" */
export function rarityScaledChance(base: number, inverse = false): string {
  const at = (r: string) => (inverse ? base / PASSIVE_RARITY_MULTIPLIER[r] : base * PASSIVE_RARITY_MULTIPLIER[r]);
  return `${pctText(at('Common'))} (Common) to ${pctText(at('Legendary'))} (Legendary)`;
}

export interface PassiveInfo {
  lang: string;
  name: string;
  desc: string;
}

/** Player-facing passive descriptions, one per combat language (C and C++ share Raw Power). */
export const PASSIVE_INFO: PassiveInfo[] = [
  { lang: 'C / C++', name: 'Raw Power', desc: `Attacks ignore ${pctText(PASSIVE.rawPower.defIgnored)} of the opponent's DEF.` },
  { lang: 'C#', name: 'Critical Hit', desc: `Each turn: ${rarityScaledChance(PASSIVE.csharp.chance)} chance to land a Critical Hit for ${PASSIVE.csharp.critMult}x damage.` },
  { lang: 'CSS', name: 'Undefined Behavior', desc: `Each turn: ${rarityScaledChance(PASSIVE.css.doubleChance)} chance to deal Double Damage; otherwise ${rarityScaledChance(PASSIVE.css.zeroChance, true)} chance to deal exactly 0 damage (rarer cards misbehave less).` },
  { lang: 'Dart', name: 'Hot Reload', desc: `Once per battle, when its HP drops below ${pctText(PASSIVE.dart.hpThreshold)}, instantly restores ${pctText(PASSIVE.dart.healMaxHpPct)} of its max HP.` },
  { lang: 'Go', name: 'First Strike', desc: 'Deals one hit to the opposing card as soon as it enters the field (blocked by Iron Shield).' },
  { lang: 'HTML', name: 'Graceful Degradation', desc: `While below ${pctText(PASSIVE.html.hpThreshold)} HP, takes ${pctText(1 - PASSIVE.html.damageTaken)} less damage. Browsers render it anyway.` },
  { lang: 'Java', name: 'JIT Warm-up', desc: `Slow start: deals ${pctText(1 - PASSIVE.java.firstTurnMult)} less damage on its first turn of each matchup, then +${pctText(PASSIVE.java.perTurn)} per turn, up to +${pctText(PASSIVE.java.maxBonus)}.` },
  { lang: 'JavaScript', name: 'Double Callback', desc: `Each turn: ${rarityScaledChance(PASSIVE.javascript.chance)} chance to hit again, dealing ${1 + PASSIVE.javascript.bonus}x damage that turn.` },
  { lang: 'Jupyter Notebook', name: 'Interactive Kernel', desc: `Heals ${pctText(PASSIVE.jupyter.regenAtkPct)} of its ATK at the end of every turn it survives, and counts as a Python card for the Python Synergy.` },
  { lang: 'Kotlin', name: 'Null Safety', desc: `Never loses more than ${pctText(PASSIVE.kotlin.maxHpPctPerTurn)} of its max HP in a single turn.` },
  { lang: 'PHP', name: '@ Error Suppression', desc: `Once per battle, a hit that would knock it out leaves it at ${PASSIVE.php.survivesAt} HP instead.` },
  { lang: 'Python', name: 'Regeneration', desc: `At the end of every turn it survives, heals for HP equal to ${pctText(PASSIVE.python.regenAtkPct)} of its ATK.` },
  { lang: 'Ruby', name: 'Last Stand', desc: `While its HP is below ${pctText(PASSIVE.ruby.hpThreshold)}, deals ${PASSIVE.ruby.atkMult}x damage.` },
  { lang: 'Rust', name: 'Iron Shield', desc: 'Enters the field with a shield that blocks all damage of its first turn (including a Go First Strike).' },
  { lang: 'Shell', name: 'Cron Job', desc: `Every ${PASSIVE.shell.every}rd turn of a matchup its attack runs twice (${PASSIVE.shell.mult}x damage).` },
  { lang: 'Swift', name: 'Dodge', desc: `Each turn: ${rarityScaledChance(PASSIVE.swift.dodgeChance)} chance to dodge the opponent's attack completely.` },
  { lang: 'TypeScript', name: 'Type Safety', desc: `Passively reduces all incoming damage by ${pctText(1 - PASSIVE.typescript.damageTaken)}.` },
];

/**
 * Short passive text printed on a card (two lines max), with the chances of
 * random passives already scaled to the card's rarity. Same numbers as PASSIVE_INFO.
 */
export function cardPassive(lang: string | null | undefined, rarity: string): { name: string; desc: string } {
  const m = PASSIVE_RARITY_MULTIPLIER[rarity] ?? 1;
  const chance = (base: number) => pctText(base * m);
  switch (lang) {
    case 'C':
    case 'C++': return { name: 'Raw Power', desc: `Attacks ignore ${pctText(PASSIVE.rawPower.defIgnored)} of the opponent's DEF.` };
    case 'C#': return { name: 'Critical Hit', desc: `${chance(PASSIVE.csharp.chance)} chance per turn to crit for ${PASSIVE.csharp.critMult}x damage.` };
    case 'CSS': return { name: 'Undefined Behavior', desc: `Each turn: ${chance(PASSIVE.css.doubleChance)} to deal 2x, ${pctText(PASSIVE.css.zeroChance / m)} to deal 0.` };
    case 'Dart': return { name: 'Hot Reload', desc: `Once, below ${pctText(PASSIVE.dart.hpThreshold)} HP: restores ${pctText(PASSIVE.dart.healMaxHpPct)} of max HP.` };
    case 'Go': return { name: 'First Strike', desc: 'Hits the opposing card as soon as it enters the field.' };
    case 'HTML': return { name: 'Graceful Degradation', desc: `Below ${pctText(PASSIVE.html.hpThreshold)} HP: takes ${pctText(1 - PASSIVE.html.damageTaken)} less damage.` };
    case 'Java': return { name: 'JIT Warm-up', desc: `${pctText(1 - PASSIVE.java.firstTurnMult)} less damage on turn 1, then +${pctText(PASSIVE.java.perTurn)}/turn (max +${pctText(PASSIVE.java.maxBonus)}).` };
    case 'JavaScript': return { name: 'Double Callback', desc: `${chance(PASSIVE.javascript.chance)} chance per turn to hit again for ${1 + PASSIVE.javascript.bonus}x damage.` };
    case 'Jupyter Notebook': return { name: 'Interactive Kernel', desc: `Heals ${pctText(PASSIVE.jupyter.regenAtkPct)} of its ATK every turn. Counts as Python.` };
    case 'Kotlin': return { name: 'Null Safety', desc: `Never loses more than ${pctText(PASSIVE.kotlin.maxHpPctPerTurn)} of its max HP in one turn.` };
    case 'PHP': return { name: '@ Error Suppression', desc: `Once per battle, survives a knockout at ${PASSIVE.php.survivesAt} HP.` };
    case 'Python': return { name: 'Regeneration', desc: `Heals ${pctText(PASSIVE.python.regenAtkPct)} of its ATK at the end of every turn.` };
    case 'Ruby': return { name: 'Last Stand', desc: `While below ${pctText(PASSIVE.ruby.hpThreshold)} HP, deals ${PASSIVE.ruby.atkMult}x damage.` };
    case 'Rust': return { name: 'Iron Shield', desc: 'Enters with a shield that blocks all damage of its first turn.' };
    case 'Shell': return { name: 'Cron Job', desc: `Every ${PASSIVE.shell.every}rd turn its attack runs twice (${PASSIVE.shell.mult}x damage).` };
    case 'Swift': return { name: 'Dodge', desc: `${chance(PASSIVE.swift.dodgeChance)} chance per turn to dodge an attack completely.` };
    case 'TypeScript': return { name: 'Type Safety', desc: `Takes ${pctText(1 - PASSIVE.typescript.damageTaken)} less damage from every hit.` };
    default: return { name: 'Neutral', desc: 'No combat passive and no type matchups.' };
  }
}

/**
 * Message key (`gameBattle` namespace: `<key>.name`, `<key>.desc`) and the `.desc` placeholder values of
 * cardPassive(lang, rarity), from the same constants, so translated card text follows PASSIVE.
 */
export function cardPassiveMessage(
  lang: string | null | undefined,
  rarity: string,
): { key: string; values?: Record<string, string | number> } {
  const m = PASSIVE_RARITY_MULTIPLIER[rarity] ?? 1;
  const chance = (base: number) => pctText(base * m);
  if (!isCombatLanguage(lang)) return { key: 'cardPassives.neutral' };
  const key = `cardPassives.${lang}`;
  switch (lang) {
    case 'C':
    case 'C++': return { key, values: { defIgnored: pctText(PASSIVE.rawPower.defIgnored) } };
    case 'C#': return { key, values: { chance: chance(PASSIVE.csharp.chance), critMult: PASSIVE.csharp.critMult } };
    case 'CSS': return { key, values: { doubleChance: chance(PASSIVE.css.doubleChance), zeroChance: pctText(PASSIVE.css.zeroChance / m) } };
    case 'Dart': return { key, values: { hpThreshold: pctText(PASSIVE.dart.hpThreshold), heal: pctText(PASSIVE.dart.healMaxHpPct) } };
    case 'HTML': return { key, values: { hpThreshold: pctText(PASSIVE.html.hpThreshold), damageReduction: pctText(1 - PASSIVE.html.damageTaken) } };
    case 'Java': return { key, values: { firstTurnPenalty: pctText(1 - PASSIVE.java.firstTurnMult), perTurn: pctText(PASSIVE.java.perTurn), maxBonus: pctText(PASSIVE.java.maxBonus) } };
    case 'JavaScript': return { key, values: { chance: chance(PASSIVE.javascript.chance), damageMult: 1 + PASSIVE.javascript.bonus } };
    case 'Jupyter Notebook': return { key, values: { regen: pctText(PASSIVE.jupyter.regenAtkPct) } };
    case 'Kotlin': return { key, values: { maxHpPct: pctText(PASSIVE.kotlin.maxHpPctPerTurn) } };
    case 'PHP': return { key, values: { hp: PASSIVE.php.survivesAt } };
    case 'Python': return { key, values: { regen: pctText(PASSIVE.python.regenAtkPct) } };
    case 'Ruby': return { key, values: { hpThreshold: pctText(PASSIVE.ruby.hpThreshold), atkMult: PASSIVE.ruby.atkMult } };
    case 'Shell': return { key, values: { every: PASSIVE.shell.every, mult: PASSIVE.shell.mult } };
    case 'Swift': return { key, values: { chance: chance(PASSIVE.swift.dodgeChance) } };
    case 'TypeScript': return { key, values: { reduction: pctText(1 - PASSIVE.typescript.damageTaken) } };
    default: return { key }; // Go, Rust: no numbers
  }
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export interface LoyaltyMilestone {
  tier: string;
  title: string;
  /** Battles fought with the card (any result) needed to unlock the tier. */
  threshold: number;
  atkDefBonus: number; // multiplier, e.g. 0.03 = 3%
  hpBonus: number;
  cosmetics: string[];
}

export const LOYALTY_MILESTONES: LoyaltyMilestone[] = [
  {
    tier: 'veteran',
    title: 'Veteran',
    threshold: 10,
    atkDefBonus: 0.03,
    hpBonus: 0,
    cosmetics: ['veteran_badge'],
  },
  {
    tier: 'trusted',
    title: 'Trusted',
    threshold: 25,
    atkDefBonus: 0.07,
    hpBonus: 0,
    cosmetics: ['trusted_badge', 'gold_border'],
  },
  {
    tier: 'reliable',
    title: 'Reliable',
    threshold: 50,
    atkDefBonus: 0.12,
    hpBonus: 0,
    cosmetics: ['reliable_badge', 'alt_color_scheme'],
  },
  {
    tier: 'legendary_bond',
    title: 'Legendary Bond',
    threshold: 100,
    atkDefBonus: 0.18,
    hpBonus: 0.05,
    cosmetics: ['legendary_bond_badge', 'particle_effect', 'profile_prestige'],
  },
  {
    tier: 'eternal',
    title: 'Eternal',
    threshold: 200,
    atkDefBonus: 0.25,
    hpBonus: 0.10,
    cosmetics: ['eternal_badge', 'holographic_frame', 'distinct_power_color', 'unique_damage_style'],
  },
];

export function getMilestoneForTier(tier: string): LoyaltyMilestone | undefined {
  return LOYALTY_MILESTONES.find(m => m.tier === tier);
}

export function getLoyaltyBonuses(tier: string): { atkMult: number; defMult: number; hpMult: number } {
  const milestone = getMilestoneForTier(tier);
  if (!milestone) return { atkMult: 1, defMult: 1, hpMult: 1 };
  return {
    atkMult: 1 + milestone.atkDefBonus,
    defMult: 1 + milestone.atkDefBonus,
    hpMult: 1 + milestone.hpBonus,
  };
}
