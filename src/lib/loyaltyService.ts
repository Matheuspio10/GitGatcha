import { Prisma } from '@prisma/client';
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

export interface PostBattleCardStats {
  userCardId: string;
  damageDealt: number;
  won: boolean;
  critsLanded: number;
  passivesTriggered: number;
}

interface LoyaltyState {
  loyaltyCount: number;
  loyaltyTier: string;
  loyaltyMilestones: unknown;
  lifetimeStats: unknown;
}

/** One more battle for a card: loyalty count, newly reached milestones and lifetime stats (pure). */
export function applyBattleToCard(card: LoyaltyState, stats: PostBattleCardStats, now = new Date()) {
  const loyaltyCount = card.loyaltyCount + 1;
  const loyaltyMilestones = Array.isArray(card.loyaltyMilestones) ? [...(card.loyaltyMilestones as { tier: string; unlockedAt: string }[])] : [];
  const existingTiers = new Set(loyaltyMilestones.map(m => m.tier));

  const unlocks: MilestoneUnlock[] = [];
  let loyaltyTier = card.loyaltyTier;
  for (const milestone of LOYALTY_MILESTONES) {
    if (loyaltyCount >= milestone.threshold && !existingTiers.has(milestone.tier)) {
      unlocks.push({
        tier: milestone.tier,
        title: milestone.title,
        atkDefBonus: milestone.atkDefBonus,
        hpBonus: milestone.hpBonus,
        cosmetics: milestone.cosmetics,
        threshold: milestone.threshold,
      });
      loyaltyMilestones.push({ tier: milestone.tier, unlockedAt: now.toISOString() });
      loyaltyTier = milestone.tier;
    }
  }

  const existingStats = (card.lifetimeStats || {}) as Partial<Record<'damageDealt' | 'battlesWon' | 'critsLanded' | 'passivesTriggered', number>>;
  const lifetimeStats = {
    damageDealt: (existingStats.damageDealt || 0) + stats.damageDealt,
    battlesWon: (existingStats.battlesWon || 0) + (stats.won ? 1 : 0),
    critsLanded: (existingStats.critsLanded || 0) + stats.critsLanded,
    passivesTriggered: (existingStats.passivesTriggered || 0) + stats.passivesTriggered,
  };

  return { data: { loyaltyCount, loyaltyTier, loyaltyMilestones, lifetimeStats }, unlocks };
}

/**
 * Loyalty and lifetime stats of every card after a battle, in one transaction.
 * The cards' rows are locked before they are read (in id order, so a PvP battle
 * between two players can't deadlock): two battles finishing at the same time
 * with the same card both count, instead of one overwriting the other.
 */
export async function processPostBattleCardStats(cardsStats: PostBattleCardStats[]): Promise<Map<string, MilestoneUnlock[]>> {
  const unlocksMap = new Map<string, MilestoneUnlock[]>();
  if (cardsStats.length === 0) return unlocksMap;

  const userCardIds = [...new Set(cardsStats.map(cs => cs.userCardId))].sort();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UserCard" WHERE id IN (${Prisma.join(userCardIds)}) ORDER BY id FOR UPDATE`;
    const userCards = await tx.userCard.findMany({
      where: { id: { in: userCardIds } },
      select: { id: true, loyaltyCount: true, loyaltyTier: true, loyaltyMilestones: true, lifetimeStats: true },
    });

    for (const stats of cardsStats) {
      const userCard = userCards.find(uc => uc.id === stats.userCardId);
      if (!userCard) continue;
      const { data, unlocks } = applyBattleToCard(userCard, stats);
      if (unlocks.length > 0) unlocksMap.set(stats.userCardId, unlocks);
      await tx.userCard.update({ where: { id: userCard.id }, data });
    }
  });

  return unlocksMap;
}
