import { prisma } from './prisma';

// ─── Level Progression ──────────────────────────────────────────────────
// XP required to reach level N: 100 * N^1.5 (rounded down)
// Level 1 = 0 XP, Level 2 = 283 XP, Level 5 = 1118 XP, Level 10 = 3162 XP

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXP) {
    level++;
  }
  return level;
}

export function getXPProgress(totalXP: number) {
  const currentLevel = getLevelFromXP(totalXP);
  const currentLevelXP = xpForLevel(currentLevel);
  const nextLevelXP = xpForLevel(currentLevel + 1);
  const xpIntoLevel = totalXP - currentLevelXP;
  const xpNeededForNext = nextLevelXP - currentLevelXP;
  const progressPercent = xpNeededForNext > 0 ? (xpIntoLevel / xpNeededForNext) * 100 : 0;

  return {
    currentLevel,
    totalXP,
    currentLevelXP,
    nextLevelXP,
    xpIntoLevel,
    xpNeededForNext,
    progressPercent,
  };
}

// ─── Level-Up Booster Rewards ───────────────────────────────────────────

export interface LevelUpReward {
  level: number;
  packId: string;
  packName: string;
  tier: 'Common' | 'Rare' | 'Epic';
}

function getBoosterRewardForLevel(level: number): LevelUpReward {
  if (level % 10 === 0) {
    return { level, packId: 'mystery-box', packName: 'Mystery Box', tier: 'Epic' };
  }
  if (level % 5 === 0) {
    return { level, packId: 'open-source-heroes', packName: 'Open Source Heroes', tier: 'Rare' };
  }
  return { level, packId: 'junk-drawer', packName: 'The Junk Drawer', tier: 'Common' };
}

// ─── Inventory Helpers ──────────────────────────────────────────────────

export interface InventoryItem {
  packId: string;
  packName: string;
  acquiredAt: string;
  source: 'purchase' | 'level_up';
}

function addToInventory(inventory: InventoryItem[], items: InventoryItem[]): InventoryItem[] {
  return [...inventory, ...items];
}

// ─── Grant XP ───────────────────────────────────────────────────────────

export interface GrantXPResult {
  previousXP: number;
  newXP: number;
  previousLevel: number;
  newLevel: number;
  levelUps: LevelUpReward[];
}

export async function grantXP(userId: string, amount: number): Promise<GrantXPResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, level: true, inventory: true },
  });

  if (!user) throw new Error('User not found');

  const previousXP = user.xp;
  const previousLevel = user.level;
  const newXP = previousXP + amount;
  const newLevel = getLevelFromXP(newXP);

  const levelUps: LevelUpReward[] = [];
  const newInventoryItems: InventoryItem[] = [];

  // Check for level-ups
  if (newLevel > previousLevel) {
    for (let lvl = previousLevel + 1; lvl <= newLevel; lvl++) {
      const reward = getBoosterRewardForLevel(lvl);
      levelUps.push(reward);
      newInventoryItems.push({
        packId: reward.packId,
        packName: reward.packName,
        acquiredAt: new Date().toISOString(),
        source: 'level_up',
      });
    }
  }

  // Build updated inventory
  const currentInventory: InventoryItem[] = Array.isArray(user.inventory) ? (user.inventory as unknown as InventoryItem[]) : [];
  const updatedInventory = addToInventory(currentInventory, newInventoryItems);

  // Update user in database
  await prisma.user.update({
    where: { id: userId },
    data: {
      xp: newXP,
      level: newLevel,
      inventory: updatedInventory as any,
    },
  });

  return {
    previousXP,
    newXP,
    previousLevel,
    newLevel,
    levelUps,
  };
}

// ─── XP Constants ───────────────────────────────────────────────────────

export const XP_AMOUNTS = {
  WIN_BATTLE_RANDOM: 80,
  WIN_BATTLE_FRIEND: 120,
  LOSE_BATTLE: 30,
  OPEN_BOOSTER: 50,
  COMPLETE_DAILY_CHALLENGE: 150,
  LOGIN_STREAK: 20,
} as const;
