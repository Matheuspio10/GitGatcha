/**
 * Tiered achievement definitions and their pure progress logic (shared by the
 * server sync and the profile UI). Tiers: 1 = Bronze, 2 = Silver, 3 = Gold.
 * Each tier is unlocked and paid once (persisted in UserAchievement).
 */

export interface AchievementStats {
  uniqueCards: number;
  legendaryCards: number;
  shinyCards: number;
  languages: number;
  pveWins: number;
  pvpWins: number;
  friends: number;
  level: number;
  /** Most battles fought by a single card (loyalty). */
  topLoyalty: number;
  /** 1 when the player owns their Signature card. */
  signature: number;
}

export type AchievementStat = keyof AchievementStats;

export interface AchievementTierDef {
  threshold: number;
  reward: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  /** Requirement, `{n}` is replaced by the tier threshold. */
  description: string;
  icon: string;
  stat: AchievementStat;
  /** Ascending thresholds; 1 to 3 tiers. */
  tiers: AchievementTierDef[];
}

export const TIER_NAMES = ['Bronze', 'Silver', 'Gold'] as const;

export function tierName(tier: number): string {
  return TIER_NAMES[tier - 1] ?? `Tier ${tier}`;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'collector', name: 'Collector', icon: '📚', stat: 'uniqueCards',
    description: 'Own {n} different cards',
    tiers: [{ threshold: 10, reward: 100 }, { threshold: 50, reward: 300 }, { threshold: 150, reward: 750 }],
  },
  {
    id: 'legendary_hunter', name: 'Legendary Hunter', icon: '🌟', stat: 'legendaryCards',
    description: 'Own {n} Legendary cards',
    tiers: [{ threshold: 1, reward: 150 }, { threshold: 5, reward: 400 }, { threshold: 15, reward: 1000 }],
  },
  {
    id: 'shiny_hunter', name: 'Shiny Hunter', icon: '✨', stat: 'shinyCards',
    description: 'Own {n} Shiny cards',
    tiers: [{ threshold: 1, reward: 100 }, { threshold: 5, reward: 300 }, { threshold: 15, reward: 800 }],
  },
  {
    id: 'polyglot', name: 'Polyglot', icon: '🌐', stat: 'languages',
    description: 'Collect cards in {n} different languages',
    tiers: [{ threshold: 5, reward: 100 }, { threshold: 10, reward: 250 }, { threshold: 20, reward: 600 }],
  },
  {
    id: 'bot_slayer', name: 'Bot Slayer', icon: '🤖', stat: 'pveWins',
    description: 'Win {n} Quick Battles',
    tiers: [{ threshold: 10, reward: 100 }, { threshold: 50, reward: 300 }, { threshold: 200, reward: 800 }],
  },
  {
    id: 'duelist', name: 'Duelist', icon: '⚔️', stat: 'pvpWins',
    description: 'Win {n} challenges against players',
    tiers: [{ threshold: 1, reward: 100 }, { threshold: 10, reward: 300 }, { threshold: 50, reward: 800 }],
  },
  {
    id: 'social_butterfly', name: 'Social Butterfly', icon: '🦋', stat: 'friends',
    description: 'Have {n} friends',
    tiers: [{ threshold: 1, reward: 50 }, { threshold: 5, reward: 150 }, { threshold: 15, reward: 400 }],
  },
  {
    id: 'veteran', name: 'Veteran', icon: '🎖️', stat: 'level',
    description: 'Reach player level {n}',
    tiers: [{ threshold: 5, reward: 100 }, { threshold: 15, reward: 300 }, { threshold: 30, reward: 750 }],
  },
  {
    id: 'ride_or_die', name: 'Ride or Die', icon: '🏛️', stat: 'topLoyalty',
    description: 'Fight {n} battles with a single card',
    tiers: [{ threshold: 10, reward: 100 }, { threshold: 50, reward: 300 }, { threshold: 100, reward: 750 }],
  },
  {
    id: 'self_portrait', name: 'Self Portrait', icon: '🪞', stat: 'signature',
    description: 'Own your Signature card (connect GitHub)',
    tiers: [{ threshold: 1, reward: 200 }],
  },
];

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

export function describeTier(def: AchievementDef, tier: number): string {
  const t = def.tiers[Math.min(Math.max(tier, 1), def.tiers.length) - 1];
  return def.description.replace('{n}', String(t.threshold));
}

/** Highest tier reached by `value` (0 = none). */
export function tierForValue(def: AchievementDef, value: number): number {
  let tier = 0;
  for (const [i, t] of def.tiers.entries()) {
    if (value >= t.threshold) tier = i + 1;
  }
  return tier;
}

/** Tiers reached by the stats that aren't in `unlocked` yet (keys `${id}:${tier}`). */
export function newlyReachedTiers(
  stats: AchievementStats,
  unlocked: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): { def: AchievementDef; tier: number; reward: number }[] {
  const out: { def: AchievementDef; tier: number; reward: number }[] = [];
  for (const def of defs) {
    const reached = tierForValue(def, stats[def.stat] ?? 0);
    for (let tier = 1; tier <= reached; tier++) {
      if (!unlocked.has(achievementKey(def.id, tier))) {
        out.push({ def, tier, reward: def.tiers[tier - 1].reward });
      }
    }
  }
  return out;
}

export function achievementKey(id: string, tier: number): string {
  return `${id}:${tier}`;
}

export interface AchievementView {
  id: string;
  name: string;
  icon: string;
  /** Requirement of the next tier (or of the last one when maxed). */
  description: string;
  value: number;
  /** Highest unlocked tier (persisted), 0 = locked. */
  tier: number;
  maxTier: number;
  /** Threshold of the next tier, null when every tier is unlocked. */
  nextThreshold: number | null;
  nextReward: number | null;
  /** 0–100 progress (value / next threshold; 100 when maxed). */
  progressPercent: number;
  unlocked: boolean;
  tiers: { tier: number; name: string; threshold: number; reward: number; unlocked: boolean; unlockedAt: string | null }[];
}

/** UI view of every achievement for a player: persisted tiers plus live progress. */
export function buildAchievementViews(
  stats: AchievementStats,
  unlockedAt: ReadonlyMap<string, Date>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementView[] {
  return defs.map(def => {
    const value = stats[def.stat] ?? 0;
    const tiers = def.tiers.map((t, i) => {
      const at = unlockedAt.get(achievementKey(def.id, i + 1));
      return { tier: i + 1, name: tierName(i + 1), threshold: t.threshold, reward: t.reward, unlocked: !!at, unlockedAt: at ? at.toISOString() : null };
    });
    // Highest persisted tier in sequence; the next goal is the first tier not unlocked
    const tier = tiers.filter(t => t.unlocked).reduce((m, t) => Math.max(m, t.tier), 0);
    const next = tiers.find(t => !t.unlocked) ?? null;
    // Matches the "value / threshold" label shown next to the bar
    const progressPercent = next ? Math.max(0, Math.min(100, (value / Math.max(1, next.threshold)) * 100)) : 100;
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      description: describeTier(def, next ? next.tier : def.tiers.length),
      value,
      tier,
      maxTier: def.tiers.length,
      nextThreshold: next ? next.threshold : null,
      nextReward: next ? next.reward : null,
      progressPercent,
      unlocked: tier > 0,
      tiers,
    };
  });
}
