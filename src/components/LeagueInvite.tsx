'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Trophy, X } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { LEAGUE_PARTICIPATION_BITS, LEAGUE_REWARDS, LEAGUE_TEAM_SIZE } from '@/lib/league';

const hiddenKey = (roundId: string) => `gg:league-invite-hidden:${roundId}`;
const noSubscribe = () => () => {};

function readHidden(roundId: string): boolean {
  try { return localStorage.getItem(hiddenKey(roundId)) === '1'; } catch { return false; }
}

/**
 * The store's card inviting players who have no Dev League lineup (see
 * leagueInvite in leagueService.ts). Hiding it lasts until the next round.
 */
export function LeagueInvite({ roundId, startsAt, players }: { roundId: string; startsAt: string; players: number }) {
  const t = useTranslations('league.invite');
  const locale = useLocale();
  // Hidden on the server render, so a card hidden earlier never flashes before storage is read
  const stored = useSyncExternalStore(noSubscribe, () => readHidden(roundId), () => true);
  const [hiddenNow, setHiddenNow] = useState(false);

  const hide = () => {
    setHiddenNow(true);
    try { localStorage.setItem(hiddenKey(roundId), '1'); } catch { /* storage unavailable */ }
  };

  if (stored || hiddenNow) return null;
  const locks = new Date(startsAt).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="relative flex flex-col gap-4 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-teal-950/60 p-5 pr-12 sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
        <Trophy size={28} weight="fill" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-lg font-black text-white">{t('title')}</h2>
        <p className="text-sm text-slate-300">
          {t('text', { size: LEAGUE_TEAM_SIZE, bits: LEAGUE_PARTICIPATION_BITS, top: LEAGUE_REWARDS[0].bits })}
        </p>
        <p className="text-xs text-emerald-200/80">
          {t('locks', { date: locks })}
          {players > 0 && <> · {t('players', { count: players })}</>}
        </p>
      </div>
      <Link href="/league" className="shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-center font-bold text-white transition-colors hover:bg-emerald-500">
        {t('cta')}
      </Link>
      <button onClick={hide} title={t('hide')} aria-label={t('hide')} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:text-white">
        <X size={16} weight="bold" />
      </button>
    </section>
  );
}
