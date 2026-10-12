/**
 * Single source of truth for battle economy and battle constants.
 *
 * Imported by the server (battle routes, battleService, loyaltyService,
 * battleResolver) AND by client pages (TeamBuilder, Wiki), so it must stay
 * free of server-only imports (no prisma, no node modules).
 */

// ─── Leagues ──────────────────────────────────────────────────────────────────

export const LEAGUE_MODES = ['OPEN', 'COMMON', 'BALANCED', 'DIVERSITY', 'LEGENDARY'] as const;
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
  // The entry fee is paid up front and never refunded. A win must be net
  // positive (900 − 500 = +400 BITS) to justify the risk; a loss pays nothing
  // (−500 BITS). Before this the win paid 300, so the league always lost money.
  LEGENDARY: {
    label: 'Legendary Only',
    rules: 'Legendary cards only.',
    winBits: 900, winXp: 200, lossBits: 0, lossXp: 30, entryFee: 500,
    allowedRarities: ['Legendary'],
  },
};

/** Friend challenges always use these rewards (no entry fee, no restrictions). */
export const FRIEND_BATTLE_LEAGUE: LeagueMode = 'OPEN';

export function getLeagueRewards(leagueMode: string, didWin: boolean): { bits: number; xp: number } {
  const league = LEAGUES[isLeagueMode(leagueMode) ? leagueMode : 'OPEN'];
  return didWin
    ? { bits: league.winBits, xp: league.winXp }
    : { bits: league.lossBits, xp: league.lossXp };
}

// ─── Stamina ──────────────────────────────────────────────────────────────────

/** Stamina spent by every card that takes part in a battle (PvE or PvP). */
export const STAMINA_COST_PER_BATTLE = 20;

// ─── Rating (PvP only) ────────────────────────────────────────────────────────

export const STARTING_RATING = 1000;
export const RATING_K_FACTOR = 32;

// ─── Passives ─────────────────────────────────────────────────────────────────

/**
 * Scales the trigger chance of random passives (CSS Undefined Behavior, JS
 * Double Callback) by card rarity. Rare is the baseline.
 */
export const PASSIVE_RARITY_MULTIPLIER: Record<string, number> = {
  Common: 0.6,
  Uncommon: 0.8,
  Rare: 1.0,
  Epic: 1.2,
  Legendary: 1.4,
};

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
