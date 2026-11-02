import type { GameNamespace, GameText, GameValues, LooseTranslator } from './gameText';
import { isGameRef, type StoredText, type StoredValue } from '@/lib/storedText';

/**
 * Turns text stored as key + values (src/lib/storedText.ts) into a sentence.
 * Rows written before it existed only have the English sentence: pass it as
 * the fallback. No React here, so the server can use it to write the English copy.
 */
export type StoredTextFormatter = (text: StoredText | null | undefined, fallback?: string | null) => string;

export function makeStoredText(t: LooseTranslator, games: Record<GameNamespace, GameText>): StoredTextFormatter {
  const own: GameText = (key, fallback, values) => (t.has(key) ? t(key, values) : fallback);
  const resolve = (value: StoredValue): string | number => {
    if (Array.isArray(value)) return value.map(resolve).join(', ');
    if (isGameRef(value)) return (value.game === 'storedText' ? own : games[value.game as GameNamespace])(value.key, value.fallback, resolveAll(value.values));
    return value as string | number;
  };
  const resolveAll = (values?: Record<string, StoredValue>): GameValues | undefined =>
    values && Object.fromEntries(Object.entries(values).map(([name, value]) => [name, resolve(value)]));

  return (text, fallback) => {
    if (!text) return fallback ?? '';
    return t.has(text.key) ? t(text.key, resolveAll(text.values)) : (fallback ?? text.key);
  };
}
