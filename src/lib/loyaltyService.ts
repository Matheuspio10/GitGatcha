import { prisma } from './prisma';

import { LOYALTY_MILESTONES, getLoyaltyBonuses, getMilestoneForTier, type LoyaltyMilestone } from './battleConfig';

// Milestone definitions and stat bonuses live in battleConfig (shared with the wiki).
export { LOYALTY_MILESTONES, getLoyaltyBonuses, getMilestoneForTier };
export type { LoyaltyMilestone };

// ─── Helpers ─────────────────────────────────────────────────────────────────

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


/**
 * Bulk update loyalty and lifetime stats for multiple cards after a battle.
 * Replaces individual calls to incrementLoyaltyAndCheck and updateLifetimeStats
 * to fix N+1 query issues.
 */
export async function processPostBattleCardStats(
  cardsStats: {
    userCardId: string;
    damageDealt: number;
    won: boolean;
    critsLanded: number;
    passivesTriggered: number;
  }[]
): Promise<Map<string, MilestoneUnlock[]>> {
  if (cardsStats.length === 0) return new Map();

  const userCardIds = cardsStats.map(cs => cs.userCardId);

  // 1. Fetch all cards in one query
  const userCards = await prisma.userCard.findMany({
    where: { id: { in: userCardIds } },
    select: { id: true, loyaltyCount: true, loyaltyTier: true, loyaltyMilestones: true, lifetimeStats: true },
  });

  const unlocksMap = new Map<string, MilestoneUnlock[]>();
  const updateOperations = [];

  for (const stats of cardsStats) {
    const userCard = userCards.find(uc => uc.id === stats.userCardId);
    if (!userCard) continue;

    // --- Loyalty Update ---
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

    if (newUnlocks.length > 0) {
      unlocksMap.set(stats.userCardId, newUnlocks);
    }

    // --- Stats Update ---
    const existingStats = (userCard.lifetimeStats as any) || {};
    const updatedStats = {
      damageDealt: (existingStats.damageDealt || 0) + stats.damageDealt,
      battlesWon: (existingStats.battlesWon || 0) + (stats.won ? 1 : 0),
      critsLanded: (existingStats.critsLanded || 0) + stats.critsLanded,
      passivesTriggered: (existingStats.passivesTriggered || 0) + stats.passivesTriggered,
    };

    // --- Queue Update Operation ---
    updateOperations.push(
      prisma.userCard.update({
        where: { id: stats.userCardId },
        data: {
          loyaltyCount: newCount,
          loyaltyTier: newTier,
          loyaltyMilestones: currentMilestones,
          lifetimeStats: updatedStats,
        },
      })
    );
  }

  // 2. Execute all updates in a single transaction
  if (updateOperations.length > 0) {
    await prisma.$transaction(updateOperations);
  }

  return unlocksMap;
}
