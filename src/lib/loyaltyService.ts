import { prisma } from './prisma';

// ─── Loyalty Milestone Definitions ───────────────────────────────────────────

export interface LoyaltyMilestone {
  tier: string;
  title: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

export function getNextMilestone(currentCount: number): LoyaltyMilestone | null {
  for (const m of LOYALTY_MILESTONES) {
    if (currentCount < m.threshold) return m;
  }
  return null; // Already at max (Eternal)
}

export function getCurrentTierFromCount(count: number): string {
  let tier = 'none';
  for (const m of LOYALTY_MILESTONES) {
    if (count >= m.threshold) {
      tier = m.tier;
    }
  }
  return tier;
}

// ─── Database Operations ─────────────────────────────────────────────────────

export interface MilestoneUnlock {
  tier: string;
  title: string;
  atkDefBonus: number;
  hpBonus: number;
  cosmetics: string[];
  threshold: number;
}

/**
 * Increment loyalty counter for a card and check for milestone unlocks.
 * Returns any newly unlocked milestones.
 */
export async function incrementLoyaltyAndCheck(
  userCardId: string
): Promise<MilestoneUnlock[]> {
  const userCard = await prisma.userCard.findUnique({
    where: { id: userCardId },
    select: { loyaltyCount: true, loyaltyTier: true, loyaltyMilestones: true },
  });

  if (!userCard) return [];

  const newCount = userCard.loyaltyCount + 1;
  const currentMilestones = (userCard.loyaltyMilestones as any[]) || [];
  const existingTiers = new Set(currentMilestones.map((m: any) => m.tier));

  const newUnlocks: MilestoneUnlock[] = [];
  let newTier = userCard.loyaltyTier;

  for (const milestone of LOYALTY_MILESTONES) {
    if (newCount >= milestone.threshold && !existingTiers.has(milestone.tier)) {
      newUnlocks.push({
        tier: milestone.tier,
        title: milestone.title,
        atkDefBonus: milestone.atkDefBonus,
        hpBonus: milestone.hpBonus,
        cosmetics: milestone.cosmetics,
        threshold: milestone.threshold,
      });
      currentMilestones.push({
        tier: milestone.tier,
        unlockedAt: new Date().toISOString(),
      });
      newTier = milestone.tier;
    }
  }

  await prisma.userCard.update({
    where: { id: userCardId },
    data: {
      loyaltyCount: newCount,
      loyaltyTier: newTier,
      loyaltyMilestones: currentMilestones,
    },
  });

  return newUnlocks;
}

/**
 * Update lifetime accumulated stats for a card after a battle.
 */
export async function updateLifetimeStats(
  userCardId: string,
  stats: {
    damageDealt: number;
    won: boolean;
    critsLanded: number;
    passivesTriggered: number;
  }
): Promise<void> {
  const userCard = await prisma.userCard.findUnique({
    where: { id: userCardId },
    select: { lifetimeStats: true },
  });

  if (!userCard) return;

  const existing = (userCard.lifetimeStats as any) || {};
  const updated = {
    damageDealt: (existing.damageDealt || 0) + stats.damageDealt,
    battlesWon: (existing.battlesWon || 0) + (stats.won ? 1 : 0),
    critsLanded: (existing.critsLanded || 0) + stats.critsLanded,
    passivesTriggered: (existing.passivesTriggered || 0) + stats.passivesTriggered,
  };

  await prisma.userCard.update({
    where: { id: userCardId },
    data: { lifetimeStats: updated },
  });
}
