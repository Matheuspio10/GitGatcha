import { useGameText, type GameText } from './gameText';
import enGamePacks from '../../messages/en/gamePacks.json';

/**
 * Pack text by pack id (namespace `gamePacks`), for every screen that shows a
 * pack. Stored/served English names are only the fallback: inventory items and
 * level-up rewards keep the English name in the database, so always look up by id.
 * Event packs (`event-<family>`) are named after the week's Sprint theme, which
 * is translated in `gameBattle` (`sprints.families.family:<family>.name`).
 */
export interface PackText {
  name: (id: string, fallback: string) => string;
  description: (id: string, fallback: string) => string;
  /** The "what can drop" summary (`activeFilters`). */
  filters: (pack: { id: string; category?: string; activeFilters?: string }) => string;
  category: (key: string, fallback: string) => string;
}

const EVENT_PREFIX = 'event-';

export function makePackText(packText: GameText, battleText: GameText): PackText {
  return {
    name(id, fallback) {
      if (id.startsWith(EVENT_PREFIX)) {
        const theme = battleText(
          `sprints.families.family:${id.slice(EVENT_PREFIX.length)}.name`,
          fallback.replace(/ Pack$/, ''),
        );
        return packText('eventPack.name', fallback, { theme });
      }
      return packText(`packs.${id}.name`, fallback);
    },
    description: (id, fallback) => packText(`packs.${id}.description`, fallback),
    filters({ id, category, activeFilters }) {
      const f = activeFilters ?? '';
      if (category === 'regional') return packText('filters.region', f, { locations: f.replace(/^Region: /, '') });
      if (category === 'event' || id.startsWith(EVENT_PREFIX)) {
        return packText('filters.weeklyEvent', f, { languages: f.replace(/^Weekly event · Languages: /, '') });
      }
      return packText(`packs.${id}.filters`, f);
    },
    category: (key, fallback) => packText(`categories.${key}`, fallback),
  };
}

/** Client and non-async server components. Async server code: `makePackText(await getGameText('gamePacks'), await getGameText('gameBattle'))`. */
export function usePackText(): PackText {
  return makePackText(useGameText('gamePacks'), useGameText('gameBattle'));
}

/**
 * English pack name -> id, for stored text that has no id (LEVEL_UP
 * notifications only keep `packNames`). Level-up rewards store
 * 'JavaScript Coven' without "The".
 */
const PACK_ID_BY_ENGLISH_NAME: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(enGamePacks.packs as Record<string, { name?: string }>)
      .filter(([, p]) => typeof p.name === 'string')
      .map(([id, p]) => [p.name, id]),
  ),
  'JavaScript Coven': 'javascript-coven',
};

export function packIdForEnglishName(name: string): string | undefined {
  return PACK_ID_BY_ENGLISH_NAME[name];
}
