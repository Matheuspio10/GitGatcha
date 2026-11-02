import { getTranslations } from 'next-intl/server';
import { getGameText } from './gameText.server';
import type { LooseTranslator } from './gameText';
import { makeStoredText, type StoredTextFormatter } from './storedTextFormat';

/** Stored text (src/lib/storedText.ts) in the player's language, for async server code. */
export async function getStoredText(): Promise<StoredTextFormatter> {
  const [t, game, gamePacks, gameAchievements, gameBattle] = await Promise.all([
    getTranslations('notifications.storedText'),
    getGameText('game'), getGameText('gamePacks'), getGameText('gameAchievements'), getGameText('gameBattle'),
  ]);
  return makeStoredText(t as unknown as LooseTranslator, { game, gamePacks, gameAchievements, gameBattle });
}
