import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getGameText } from '@/i18n/gameText.server';
import { LEAGUES, isLeagueMode } from '@/lib/battleConfig';
import { getStoredReplay } from '@/lib/battleReplayService';

/** One request reads the battle once (page, metadata and preview image share it). */
export const loadReplay = cache(getStoredReplay);

/** Player names and the league label of a replay, in the visitor's language. */
export async function replayLabels(replay: NonNullable<Awaited<ReturnType<typeof getStoredReplay>>>) {
  const [t, battleText] = await Promise.all([getTranslations('public.replay'), getGameText('gameBattle')]);
  const challengerName = replay.challenger.username ?? '?';
  const defenderName = replay.defender?.username ?? (replay.leagueMode === 'TOWER' ? t('tower') : t('computer'));
  const mode = replay.leagueMode;
  const league = mode === 'TOWER'
    ? t('tower')
    : isLeagueMode(mode) ? battleText(`leagues.${mode}.label`, LEAGUES[mode].label) : mode;
  return {
    challengerName,
    defenderName,
    winnerName: replay.winnerSide === 'CHALLENGER' ? challengerName : defenderName,
    league,
  };
}
