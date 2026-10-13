import { prisma } from './prisma';
import { addBits } from './bitsLedger';
import { withUserLock } from './userLock';
import {
  achievementKey,
  AchievementStats,
  AchievementView,
  buildAchievementViews,
  newlyReachedTiers,
  tierName,
} from './achievementUtils';

export interface UnlockedAchievement {
  id: string;
  name: string;
  icon: string;
  tier: number;
  tierName: string;
  reward: number;
}

/** Live progress of every achievement stat, read from the player's data. Null when the user doesn't exist. */
export async function computeAchievementStats(userId: string): Promise<AchievementStats | null> {
  const [user, cards, pveWins, pvpWins, friends] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { level: true } }),
    prisma.userCard.findMany({
      where: { userId },
      select: { cardId: true, isShiny: true, edition: true, loyaltyCount: true, card: { select: { rarity: true, primaryLanguage: true } } },
    }),
    // Quick Battles (against the computer) are random battles without a defender
    prisma.battle.count({ where: { challengerId: userId, isRandom: true, status: 'COMPLETED', winnerId: userId } }),
    // Friend challenges (expired ones are excluded: they are COMPLETED only when actually fought)
    prisma.battle.count({ where: { winnerId: userId, isRandom: false, status: 'COMPLETED', defenderId: { not: null } } }),
    prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] } }),
  ]);
  if (!user) return null;

  const uniqueCards = new Set<string>();
  const legendary = new Set<string>();
  const languages = new Set<string>();
  let shinyCards = 0;
  let topLoyalty = 0;
  let signature = 0;
  for (const uc of cards) {
    uniqueCards.add(uc.cardId);
    if (uc.card.rarity === 'Legendary') legendary.add(uc.cardId);
    const lang = uc.card.primaryLanguage;
    if (lang && lang !== 'Unknown') languages.add(lang.toLowerCase());
    if (uc.isShiny) shinyCards++;
    if (uc.edition === 'signature') signature = 1;
    topLoyalty = Math.max(topLoyalty, uc.loyaltyCount);
  }

  return {
    uniqueCards: uniqueCards.size,
    legendaryCards: legendary.size,
    shinyCards,
    languages: languages.size,
    pveWins,
    pvpWins,
    friends,
    level: user.level,
    topLoyalty,
    signature,
  };
}

/**
 * Persists every achievement tier the player has newly reached and pays its BITS
 * once. Each tier is inserted on its own with ON CONFLICT DO NOTHING and only the
 * rows actually inserted are paid, all in one transaction under the user lock, so
 * parallel syncs can never pay the same tier twice.
 */
export async function syncAchievements(userId: string): Promise<UnlockedAchievement[]> {
  const stats = await computeAchievementStats(userId);
  if (!stats) return [];

  // Cheap pre-check outside the lock: most calls have nothing new
  const existing = await prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true, tier: true } });
  const candidates = newlyReachedTiers(stats, new Set(existing.map(a => achievementKey(a.achievementId, a.tier))));
  if (candidates.length === 0) return [];

  return withUserLock(userId, async (tx) => {
    const unlocked: UnlockedAchievement[] = [];
    for (const c of candidates) {
      const { count } = await tx.userAchievement.createMany({
        data: [{ userId, achievementId: c.def.id, tier: c.tier }],
        skipDuplicates: true,
      });
      if (count === 1) {
        unlocked.push({ id: c.def.id, name: c.def.name, icon: c.def.icon, tier: c.tier, tierName: tierName(c.tier), reward: c.reward });
      }
    }
    const total = unlocked.reduce((sum, a) => sum + a.reward, 0);
    if (total > 0) {
      await addBits(userId, total, 'achievement', { tx, detail: unlocked.map(a => `${a.name} ${a.tierName}`).join(', ') });
    }
    return unlocked;
  });
}

/** syncAchievements for hooks after an action that already succeeded: never throws. */
export async function syncAchievementsSafe(userId: string | null | undefined): Promise<UnlockedAchievement[]> {
  if (!userId) return [];
  try {
    return await syncAchievements(userId);
  } catch (err) {
    console.error('[Achievements] Sync failed:', (err as Error).message);
    return [];
  }
}

/** Every achievement of the player with persisted tiers and live progress. */
export async function getAchievementViews(userId: string): Promise<AchievementView[]> {
  const [stats, rows] = await Promise.all([
    computeAchievementStats(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true, tier: true, unlockedAt: true } }),
  ]);
  const unlockedAt = new Map(rows.map(r => [achievementKey(r.achievementId, r.tier), r.unlockedAt]));
  return buildAchievementViews(stats ?? emptyStats(), unlockedAt);
}

function emptyStats(): AchievementStats {
  return { uniqueCards: 0, legendaryCards: 0, shinyCards: 0, languages: 0, pveWins: 0, pvpWins: 0, friends: 0, level: 1, topLoyalty: 0, signature: 0 };
}
