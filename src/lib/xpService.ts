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

// Language Packs pool
const LANGUAGE_PACKS = [
  { id: 'javascript-coven', name: 'JavaScript Coven' },
  { id: 'pythonistas', name: 'Pythonistas' },
  { id: 'rust-or-bust', name: 'Rust or Bust' },
  { id: 'css-wizards', name: 'CSS Wizards' },
  { id: 'the-go-gophers', name: 'The Go Gophers' },
  { id: 'ruby-relics', name: 'Ruby Relics' },
  { id: 'c-plus-plus-ancients', name: 'C++ Ancients' }
];

// Contributor Type Packs pool
const CONTRIBUTOR_PACKS = [
  { id: 'the-open-source-heroes', name: 'The Open Source Heroes' },
  { id: 'the-solo-architects', name: 'The Solo Architects' },
  { id: 'the-silent-giants', name: 'The Silent Giants' },
  { id: 'the-maintainers', name: 'The Maintainers' }
];

// Era Packs pool
const ERA_PACKS = [
  { id: 'github-ogs', name: 'GitHub OGs' },
  { id: 'new-blood', name: 'New Blood' },
  { id: 'the-fossils', name: 'The Fossils' }
];

export interface LevelUpReward {
  level: number;
  packIds: string[];
  packNames: string[];
  coins: number;
  badge?: string;
}

function getRandomPack(pool: { id: string, name: string }[]) {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function getRewardsForLevel(level: number): LevelUpReward {
  const reward: LevelUpReward = {
    level,
    packIds: [],
    packNames: [],
    coins: 0
  };

  // 1. Every single level up grants 1 randomly selected language pack
  const langPack = getRandomPack(LANGUAGE_PACKS);
  reward.packIds.push(langPack.id);
  reward.packNames.push(langPack.name);

  // 2. Multiples of 5 grant an additional contributor pack
  if (level % 5 === 0) {
    const contribPack = getRandomPack(CONTRIBUTOR_PACKS);
    reward.packIds.push(contribPack.id);
    reward.packNames.push(contribPack.name);
  }

  // 3. Multiples of 10 grant an additional era pack + 100 coins
  if (level % 10 === 0) {
    const eraPack = getRandomPack(ERA_PACKS);
    reward.packIds.push(eraPack.id);
    reward.packNames.push(eraPack.name);
    reward.coins += 100;
  }

  // 4. Multiples of 25 grant 1 Mystery Box + 250 coins
  if (level % 25 === 0) {
    reward.packIds.push('mystery-box');
    reward.packNames.push('The Mystery Box');
    reward.coins += 250;
  }

  // 5. Multiples of 50 grant 1 Legendary Drop + 500 coins + unique badge
  if (level % 50 === 0) {
    reward.packIds.push('legendary-drop');
    reward.packNames.push('The Legendary Drop');
    reward.coins += 500;
    reward.badge = `Level ${level} Vanguard`;
  }

  return reward;
}

// ─── Inventory Helpers ──────────────────────────────────────────────────

export interface InventoryItem {
  packId: string;
  packName: string;
  acquiredAt: string;
  source: 'purchase' | 'level_up' | string;
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

import { v4 as uuidv4 } from 'uuid';

export async function grantXP(userId: string, amount: number): Promise<GrantXPResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      xp: true, 
      level: true, 
      inventory: true, 
      currency: true,
      pendingRewards: true,
      notifications: true
    },
  });

  if (!user) throw new Error('User not found');

  const previousXP = user.xp;
  const previousLevel = user.level;
  const newXP = previousXP + amount;
  const newLevel = getLevelFromXP(newXP);

  const levelUps: LevelUpReward[] = [];
  const newInventoryItems: InventoryItem[] = [];
  let totalCoinsGained = 0;

  // Check for level-ups
  if (newLevel > previousLevel) {
    for (let lvl = previousLevel + 1; lvl <= newLevel; lvl++) {
      const reward = getRewardsForLevel(lvl);
      levelUps.push(reward);
      totalCoinsGained += reward.coins;
      
      reward.packIds.forEach((packId, index) => {
        newInventoryItems.push({
          packId,
          packName: reward.packNames[index],
          acquiredAt: new Date().toISOString(),
          source: 'level_up',
        });
      });
    }
  }

  // Build updated items
  const currentInventory: InventoryItem[] = Array.isArray(user.inventory) ? (user.inventory as unknown as InventoryItem[]) : [];
  const updatedInventory = addToInventory(currentInventory, newInventoryItems);
  
  const currentPendingRewards: LevelUpReward[] = Array.isArray(user.pendingRewards) ? (user.pendingRewards as unknown as LevelUpReward[]) : [];
  const updatedPendingRewards = [...currentPendingRewards, ...levelUps];
  
  const currentNotifications: any[] = Array.isArray(user.notifications) ? (user.notifications as any[]) : [];
  let updatedNotifications = [...currentNotifications];

  if (levelUps.length > 0) {
    const combinedPacks = levelUps.flatMap(reward => reward.packNames);
    updatedNotifications.push({
      id: uuidv4(),
      type: 'LEVEL_UP',
      timestamp: new Date().toISOString(),
      read: false,
      payload: {
        levelsCrossed: levelUps.map(r => r.level),
        packNames: combinedPacks,
        totalCoins: totalCoinsGained
      }
    });
  }

  // Update user in database
  await prisma.user.update({
    where: { id: userId },
    data: {
      xp: newXP,
      level: newLevel,
      currency: user.currency + totalCoinsGained,
      inventory: updatedInventory as any,
      pendingRewards: updatedPendingRewards as any,
      notifications: updatedNotifications as any
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
