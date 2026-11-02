/**
 * Text saved in the database (notifications, the BITS history) as a message
 * key + values instead of a finished English sentence, so it is translated
 * where it is shown (src/i18n/storedText.ts). Keys live in the `storedText`
 * block of messages/<locale>/notifications.json.
 *
 * A value can point at game text (a rank, a league, a pack…) by its key in a
 * game namespace, or at another stored-text key ("a friend", "win"), with the
 * English as the fallback. A list of values is shown joined by commas. Client-safe.
 */
import type { GameNamespace } from '@/i18n/gameText';
import type { Messages } from '@/i18n/messages';
import { missionRequiredCount, parseCollectTarget } from './missionUtils';

export type StoredTextKey = keyof Messages['notifications']['storedText'];

/** Where a referenced text lives: a game namespace, or this same storedText block. */
export type TextNamespace = GameNamespace | 'storedText';

export interface GameRef {
  game: TextNamespace;
  key: string;
  /** English text, shown when the key is missing and used for the English copy. */
  fallback: string;
  values?: Record<string, StoredValue>;
}

export type StoredValue = string | number | GameRef | readonly StoredValue[];

export interface StoredText {
  key: StoredTextKey;
  values?: Record<string, StoredValue>;
}

export function storedText(key: StoredTextKey, values?: Record<string, StoredValue>): StoredText {
  return values ? { key, values } : { key };
}

export function isGameRef(value: unknown): value is GameRef {
  return typeof value === 'object' && value !== null && typeof (value as GameRef).game === 'string' && typeof (value as GameRef).key === 'string';
}

export function isStoredText(value: unknown): value is StoredText {
  return typeof value === 'object' && value !== null && typeof (value as StoredText).key === 'string';
}

function gameRef(game: TextNamespace, key: string, fallback: string, values?: Record<string, StoredValue>): GameRef {
  return values ? { game, key, fallback, values } : { game, key, fallback };
}

const EVENT_PACK_PREFIX = 'event-';

/** Another storedText key used as a value ("a friend", "win"), with its English text. */
export function ownText(key: StoredTextKey, fallback: string, values?: Record<string, StoredValue>): GameRef {
  return gameRef('storedText', key, fallback, values);
}

/** A player's name, or "Someone" / "a friend" when there is none. */
export const playerName = (username: string | null | undefined, missing: 'someone' | 'aFriend' = 'someone'): StoredValue =>
  username || ownText(missing, missing === 'someone' ? 'Someone' : 'a friend');

export const winLoss = (won: boolean) => (won ? ownText('win', 'win') : ownText('loss', 'loss'));

/** Game names by id (same keys the screens use; see packText.ts, SprintBoard.tsx, MissionsPanel.tsx). */
export const gameName = {
  rank: (tier: { id: string; name: string }) => gameRef('gameBattle', `ranks.${tier.id}.name`, tier.name),
  league: (mode: string, label: string) => gameRef('gameBattle', `leagues.${mode}.label`, label),
  tower: (theme: string) => gameRef('gameBattle', 'tower.name', `The ${theme} Gauntlet`, { theme }),
  sprintKind: (kind: string, label: string) => gameRef('gameBattle', `sprints.kinds.${kind}.label`, label),
  sprintTheme: (theme: { id: string; name: string; languages: readonly string[] }) => theme.id.startsWith('family:')
    ? gameRef('gameBattle', `sprints.families.${theme.id}.name`, theme.name)
    : gameRef('gameBattle', 'sprints.languageTheme.name', theme.name, { language: theme.languages[0] ?? theme.id.replace(/^lang:/, '') }),
  pack: (id: string, name: string) => id.startsWith(EVENT_PACK_PREFIX)
    ? gameRef('gamePacks', 'eventPack.name', name, {
      theme: gameRef('gameBattle', `sprints.families.family:${id.slice(EVENT_PACK_PREFIX.length)}.name`, name.replace(/ Pack$/, '')),
    })
    : gameRef('gamePacks', `packs.${id}.name`, name),
  achievement: (id: string, name: string) => gameRef('gameAchievements', `achievements.${id}.name`, name),
  achievementTier: (tier: number, name: string) => gameRef('gameAchievements', `tiers.${tier}`, name),
  onboardingStep: (id: string, title: string) => gameRef('game', `onboardingSteps.${id}.title`, title),
  mission: (period: string, m: { description: string; type: string; targetValue: string | null }): StoredValue => {
    if (period === 'dev') return gameRef('game', `missions.dev.${(m.targetValue ?? '').replace(/:/g, '_')}`, m.description);
    const key = `missions.${period}.${m.type}`;
    if (m.type === 'COLLECT_RARITY' || m.type === 'COLLECT_LANGUAGE') {
      const { value, count } = parseCollectTarget(m.targetValue);
      if (value === null) return m.description;
      return gameRef('game', key, m.description, m.type === 'COLLECT_RARITY' ? { count, rarity: value } : { count, language: value });
    }
    if (m.type === 'OPEN_BOOSTER' || m.type === 'WIN_BATTLE') {
      return gameRef('game', key, m.description, { count: missionRequiredCount(m.type, m.targetValue) });
    }
    return m.description;
  },
};
