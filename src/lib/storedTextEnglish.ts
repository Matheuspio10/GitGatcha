import { createTranslator } from 'next-intl';
import { MESSAGES } from '@/i18n/messages';
import type { GameNamespace, GameText, LooseTranslator } from '@/i18n/gameText';
import { makeStoredText } from '@/i18n/storedTextFormat';
import type { StoredText } from './storedText';

/**
 * The English sentence of a stored text, written next to it (Notification.message,
 * BitsTransaction.detail): readable in the database and the fallback for any
 * screen that only knows the sentence. Server only (loads every message file).
 */
const translator = (namespace: string) =>
  createTranslator({ locale: 'en', messages: MESSAGES.en, namespace: namespace as never }) as unknown as LooseTranslator;

const gameText = (namespace: GameNamespace): GameText => {
  const t = translator(namespace);
  return (key, fallback, values) => (t.has(key) ? t(key, values) : fallback);
};

const format = makeStoredText(translator('notifications.storedText'), {
  game: gameText('game'),
  gamePacks: gameText('gamePacks'),
  gameAchievements: gameText('gameAchievements'),
  gameBattle: gameText('gameBattle'),
});

export function englishText(text: StoredText): string {
  return format(text);
}
