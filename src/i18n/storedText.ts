import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useGameText, type LooseTranslator } from './gameText';
import { makeStoredText, type StoredTextFormatter } from './storedTextFormat';

export type { StoredTextFormatter } from './storedTextFormat';

/** Stored text (src/lib/storedText.ts) in the player's language, for client and non-async server components. */
export function useStoredText(): StoredTextFormatter {
  const t = useTranslations('notifications.storedText') as unknown as LooseTranslator;
  const game = useGameText('game');
  const gamePacks = useGameText('gamePacks');
  const gameAchievements = useGameText('gameAchievements');
  const gameBattle = useGameText('gameBattle');
  return useMemo(
    () => makeStoredText(t, { game, gamePacks, gameAchievements, gameBattle }),
    [t, game, gamePacks, gameAchievements, gameBattle],
  );
}
