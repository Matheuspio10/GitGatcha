import type { StoredText } from './storedText';
import { englishText } from './storedTextEnglish';

/**
 * One line of User.fragmentLogs (the forge's fragment history). `text` is
 * translated where it is shown; `source` is its English sentence (the only text
 * of lines written before `text` existed). Server only.
 */
export interface FragmentLogEntry {
  date: string;
  source: string;
  text?: StoredText;
  language: string;
  amount: number;
}

export function fragmentLogEntry(text: StoredText, language: string, amount: number, date = new Date().toISOString()): FragmentLogEntry {
  return { date, source: englishText(text), text, language, amount };
}
