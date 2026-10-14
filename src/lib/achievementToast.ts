'use client';

import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useGameText } from '@/i18n/gameText';
import { tierName } from './achievementUtils';

export interface AchievementUnlockNotice {
  /** Achievement id (achievementUtils.ts), used to translate its name. */
  id?: string;
  name: string;
  tier: number;
  reward: number;
  icon?: string;
}

/**
 * Shows one toast per achievement tier unlocked (from an API response's
 * `achievementsUnlocked`) and resyncs the BITS balance, since rewards are
 * already credited server-side. No-op for an empty or missing list.
 * `message` builds the toast text (English by default).
 */
export function notifyAchievements(
  list?: AchievementUnlockNotice[] | null,
  message: (a: AchievementUnlockNotice) => string = a => `Achievement unlocked: ${a.name} ${tierName(a.tier)}${a.reward > 0 ? ` (+${a.reward} Bits)` : ''}`,
): void {
  if (!Array.isArray(list) || list.length === 0) return;
  for (const a of list) {
    toast.success(message(a), { icon: a.icon ?? '🏆', duration: 5000 });
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bits:refresh'));
}

/** notifyAchievements with the toast in the player's language. */
export function useNotifyAchievements() {
  const text = useGameText('gameAchievements');
  return useCallback((list?: AchievementUnlockNotice[] | null) => notifyAchievements(list, a => {
    const name = a.id ? text(`achievements.${a.id}.name`, a.name) : a.name;
    const tier = text(`tiers.${a.tier}`, tierName(a.tier));
    return text('toast.unlocked', `Achievement unlocked: ${name} ${tier}${a.reward > 0 ? ` (+${a.reward} Bits)` : ''}`, { name, tier, reward: a.reward });
  }), [text]);
}
