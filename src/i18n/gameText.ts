import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Game data (packs, achievements, passives, leagues, missions…) lives in
 * src/lib with English text and stable ids. It is translated where it is shown,
 * by id: `gameText('packs.rust-or-bust.name', pack.name)`. The English text in
 * src/lib stays the fallback, so a missing key (a new pack, a removed one)
 * still shows something sensible instead of the raw key.
 *
 * Keys are built from ids at runtime, so they can't be type-checked like screen
 * text; the parity test still checks English and Portuguese have the same keys.
 */
export type GameNamespace = 'game' | 'gamePacks' | 'gameAchievements' | 'gameBattle';
export type GameValues = Record<string, string | number | Date>;
export type GameText = (key: string, fallback: string, values?: GameValues) => string;

type LooseTranslator = {
  has: (key: string) => boolean;
  (key: string, values?: GameValues): string;
};

function fromTranslator(t: LooseTranslator): GameText {
  return (key, fallback, values) => (t.has(key) ? t(key, values) : fallback);
}

/**
 * Client and server components (not async): `const gameText = useGameText('gamePacks')`.
 * Stable between renders (like the translator), so it can sit in effect dependencies.
 */
export function useGameText(namespace: GameNamespace): GameText {
  const t = useTranslations(namespace) as unknown as LooseTranslator;
  return useMemo(() => fromTranslator(t), [t]);
}

// Async server code: getGameText in ./gameText.server.ts
export { fromTranslator };
export type { LooseTranslator };
