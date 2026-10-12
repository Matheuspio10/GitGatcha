'use client';

import toast from 'react-hot-toast';
import { tierName } from './achievementUtils';

export interface AchievementUnlockNotice {
  name: string;
  tier: number;
  reward: number;
  icon?: string;
}

/**
 * Shows one toast per achievement tier unlocked (from an API response's
 * `achievementsUnlocked`) and resyncs the BITS balance, since rewards are
 * already credited server-side. No-op for an empty or missing list.
 */
export function notifyAchievements(list?: AchievementUnlockNotice[] | null): void {
  if (!Array.isArray(list) || list.length === 0) return;
  for (const a of list) {
    const reward = a.reward > 0 ? ` (+${a.reward} Bits)` : '';
    toast.success(`Achievement unlocked: ${a.name} ${tierName(a.tier)}${reward}`, {
      icon: a.icon ?? '🏆',
      duration: 5000,
    });
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bits:refresh'));
}
