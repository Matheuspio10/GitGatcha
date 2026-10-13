import { lockUser, withUserLock, Tx } from './userLock';
import { addBits, type BitsReason } from './bitsLedger';

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
  { id: 'go-gophers', name: 'The Go Gophers' },
  { id: 'ruby-relics', name: 'Ruby Relics' },
  { id: 'cpp-ancients', name: 'C++ Ancients' }
];

// Contributor Type Packs pool
const CONTRIBUTOR_PACKS = [
  { id: 'open-source-heroes', name: 'The Open Source Heroes' },
  { id: 'solo-architects', name: 'The Solo Architects' },
  { id: 'silent-giants', name: 'The Silent Giants' },
  { id: 'maintainers', name: 'The Maintainers' }
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

/**
 * Adds XP (and optionally BITS) and hands out level-up rewards.
 * Pass `tx` when the caller is already inside `withUserLock`; otherwise it takes the lock itself.
 */
export async function grantXP(
  userId: string,
  amount: number,
  additionalCurrency: number = 0,
  tx?: Tx,
  currencyReason: BitsReason = 'mission',
  currencyDetail?: string,
): Promise<GrantXPResult> {
  if (!tx) return withUserLock(userId, (t) => grantXP(userId, amount, additionalCurrency, t, currencyReason, currencyDetail));
  await lockUser(tx, userId);

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { 
      xp: true, 
      level: true, 
      inventory: true, 
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
  let levelUpCoins = 0;

  // Check for level-ups
  if (newLevel > previousLevel) {
    for (let lvl = previousLevel + 1; lvl <= newLevel; lvl++) {
      const reward = getRewardsForLevel(lvl);
      levelUps.push(reward);
      levelUpCoins += reward.coins;
      
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

  const data: Record<string, unknown> = {
    xp: newXP,
    level: newLevel,
  };

  if (levelUps.length > 0) {
    const currentInventory: InventoryItem[] = Array.isArray(user.inventory) ? (user.inventory as unknown as InventoryItem[]) : [];
    const currentPendingRewards: LevelUpReward[] = Array.isArray(user.pendingRewards) ? (user.pendingRewards as unknown as LevelUpReward[]) : [];
    const currentNotifications: any[] = Array.isArray(user.notifications) ? (user.notifications as any[]) : [];

    data.inventory = addToInventory(currentInventory, newInventoryItems);
    data.pendingRewards = [...currentPendingRewards, ...levelUps];
    data.notifications = [...currentNotifications, {
      id: uuidv4(),
      type: 'LEVEL_UP',
      timestamp: new Date().toISOString(),
      read: false,
      payload: {
        levelsCrossed: levelUps.map(r => r.level),
        packNames: levelUps.flatMap(reward => reward.packNames),
        totalCoins: levelUpCoins
      }
    }];
  }

  await tx.user.update({ where: { id: userId }, data: data as any });
  // BITS through the ledger (same transaction)
  await addBits(userId, additionalCurrency, currencyReason, { tx, detail: currencyDetail });
  await addBits(userId, levelUpCoins, 'level_up', { tx, detail: `Level ${levelUps.map(r => r.level).join(', ')}` });

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
