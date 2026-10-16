'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { BookOpenText, Crown, MagnifyingGlass, Plus, Trophy, Users, X } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { sizedAvatar } from '@/lib/avatarUrl';
import { UserAvatar } from '@/components/UserAvatar';
import {
  LEAGUE_BUDGET,
  LEAGUE_CAPTAIN_MULTIPLIER,
  LEAGUE_TEAM_SIZE,
  lineupDevPoints,
  type Ownership,
} from '@/lib/league';

// ─── What GET /api/league answers ───────────────────────────────────────────

interface DevCard { id: string; name: string; githubUsername: string; avatarUrl: string | null; rarity: string; primaryLanguage: string | null }
interface MarketDev extends DevCard { price: number; form: number; owned: Ownership }
interface DevScore { points: number; commits: number; pullRequests: number; reviews: number; issues: number; activeDays: number }
interface LineupView {
  cardIds: string[];
  captainId: string;
  cost: number;
  points: number;
  position: number | null;
  cards: (DevCard & { owned: Ownership; score: DevScore | null })[];
}
interface Ranked { username: string | null; image: string | null; points: number; you?: boolean }
interface LeagueState {
  running: {
    id: string; startsAt: string; endsAt: string; players: number;
    lineup: LineupView | null; position: number | null;
    top: { points: number; user: { username: string | null; image: string | null } }[];
    friends: Ranked[];
  };
  last: { roundId: string; points: number; position: number | null; rewardBits: number; players: number } | null;
  next: { id: string; startsAt: string; lineup: LineupView | null };
  market: MarketDev[];
  marketComplete: boolean;
  selfCardId: string | null;
}

const RARITY_TEXT: Record<string, string> = {
  Common: 'text-slate-300', Uncommon: 'text-green-400', Rare: 'text-blue-400', Epic: 'text-purple-400', Legendary: 'text-yellow-400',
};
const RARITY_RING: Record<string, string> = {
  Common: 'border-slate-500', Uncommon: 'border-green-500', Rare: 'border-blue-500', Epic: 'border-purple-500', Legendary: 'border-yellow-400',
};
const PAGE = 60;

function Avatar({ dev, size }: { dev: DevCard; size: number }) {
  return (
    <img
      src={sizedAvatar(dev.avatarUrl || `https://github.com/${dev.githubUsername}.png`, size)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={clsx('shrink-0 rounded-lg border-2 object-cover', RARITY_RING[dev.rarity] ?? 'border-slate-500')}
      style={{ width: size, height: size }}
    />
  );
}

export default function LeagueClient() {
  const t = useTranslations('league');
  const locale = useLocale();
  const [state, setState] = useState<LeagueState | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'lineup' | 'round'>('lineup');

  // Lineup being built (card ids in order) and its captain
  const [picks, setPicks] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Market controls
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'price' | 'form' | 'name'>('form');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/league', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data: LeagueState = await res.json();
      setState(data);
      // Start from the saved lineup, or this round's (it repeats if left alone)
      const base = data.next.lineup ?? data.running.lineup;
      const onMarket = new Set(data.market.map(m => m.id));
      const ids = base ? base.cardIds.filter(id => onMarket.has(id)) : [];
      setPicks(ids);
      setCaptain(base && ids.includes(base.captainId) ? base.captainId : null);
      setDirty(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map((state?.market ?? []).map(m => [m.id, m])), [state]);
  const cost = picks.reduce((sum, id) => sum + (byId.get(id)?.price ?? 0), 0);
  const left = LEAGUE_BUDGET - cost;
  const full = picks.length >= LEAGUE_TEAM_SIZE;

  const market = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const list = state.market.filter(m =>
      (!onlyOwned || m.owned !== 'none')
      && (!q || m.name.toLowerCase().includes(q) || m.githubUsername.toLowerCase().includes(q)));
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'price' ? b.price - a.price || b.form - a.form
          : b.form - a.form || a.price - b.price);
  }, [state, query, sort, onlyOwned]);

  const add = (id: string) => {
    if (full || picks.includes(id)) return;
    setPicks(p => [...p, id]);
    setCaptain(c => c ?? id);
    setDirty(true);
  };
  const remove = (id: string) => {
    setPicks(p => p.filter(x => x !== id));
    setCaptain(c => (c === id ? null : c));
    setDirty(true);
  };

  const save = async () => {
    if (!captain || !state) return;
    setSaving(true);
    try {
      const res = await fetch('/api/league/lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: picks, captainId: captain }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t('loadFailed'));
        return;
      }
      toast.success(t('builder.saved', { date: dayLabel(state.next.startsAt) }));
      await load();
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  if (failed) return <p className="py-20 text-center text-rose-300">{t('loadFailed')}</p>;
  if (!state) return <p className="animate-pulse py-20 text-center text-slate-400">{t('loading')}</p>;

  const lastDay = new Date(new Date(state.running.endsAt).getTime() - 24 * 3600_000).toISOString();
  const nextStart = new Date(state.next.startsAt).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const saveable = picks.length === LEAGUE_TEAM_SIZE && !!captain && left >= 0 && dirty;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-5xl font-black tracking-tighter text-transparent">{t('title')}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-slate-400">{t('subtitle')}</p>
        <Link href="/wiki#dev-league" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300">
          <BookOpenText size={16} weight="bold" /> {t('wiki')}
        </Link>
      </div>

      {state.last && (
        <p className="mx-auto max-w-2xl rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-center text-sm text-emerald-200">
          {t('round.last', { date: dayLabel(state.last.roundId), points: state.last.points, position: state.last.position ?? '-', players: state.last.players, bits: state.last.rewardBits })}
        </p>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {(['lineup', 'round'] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx('rounded-xl px-5 py-2.5 text-sm font-bold transition-all',
              tab === key ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-white')}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'lineup' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* ── Lineup ── */}
          <section className="h-fit space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:sticky lg:top-24">
            <div>
              <h2 className="text-lg font-bold text-white">{t('builder.title', { date: dayLabel(state.next.startsAt) })}</h2>
              <p className="mt-1 text-xs text-slate-400">{t('rounds.nextStarts', { date: nextStart })}</p>
            </div>

            {/* Budget */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">{t('builder.budget', { used: cost, budget: LEAGUE_BUDGET })}</span>
                <span className={left < 0 ? 'font-bold text-rose-300' : 'text-slate-400'}>
                  {left < 0 ? t('builder.over', { over: -left }) : t('builder.left', { left })}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className={clsx('h-full rounded-full transition-all', left < 0 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, (cost / LEAGUE_BUDGET) * 100)}%` }} />
              </div>
            </div>

            {/* Slots */}
            <ul className="space-y-2">
              {Array.from({ length: LEAGUE_TEAM_SIZE }, (_, i) => {
                const dev = picks[i] ? byId.get(picks[i]) : undefined;
                if (!dev) {
                  return <li key={`empty-${i}`} className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-500">{t('builder.slot')}</li>;
                }
                const isCaptain = captain === dev.id;
                return (
                  <li key={dev.id} className={clsx('flex items-center gap-3 rounded-xl border p-2', isCaptain ? 'border-amber-400/60 bg-amber-500/10' : 'border-slate-700 bg-slate-800/40')}>
                    <Avatar dev={dev} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{dev.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {t('market.price', { price: dev.price })} · {t('market.form', { points: dev.form })}
                        {dev.owned !== 'none' && <span className="ml-1 text-emerald-300">· {t(dev.owned === 'shiny' ? 'market.shiny' : 'market.owned')}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => { setCaptain(dev.id); setDirty(true); }}
                      aria-pressed={isCaptain}
                      title={isCaptain ? t('builder.captain', { times: LEAGUE_CAPTAIN_MULTIPLIER }) : t('builder.makeCaptain', { name: dev.name })}
                      aria-label={isCaptain ? t('builder.captain', { times: LEAGUE_CAPTAIN_MULTIPLIER }) : t('builder.makeCaptain', { name: dev.name })}
                      className={clsx('rounded-lg p-1.5', isCaptain ? 'text-amber-300' : 'text-slate-500 hover:text-amber-200')}
                    >
                      <Crown size={18} weight={isCaptain ? 'fill' : 'regular'} />
                    </button>
                    <button onClick={() => remove(dev.id)} aria-label={t('builder.remove', { name: dev.name })} className="rounded-lg p-1.5 text-slate-500 hover:text-rose-300">
                      <X size={16} weight="bold" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {picks.length === LEAGUE_TEAM_SIZE && !captain && <p className="text-xs text-amber-300">{t('builder.pickCaptain')}</p>}

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={!saveable || saving}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
              >
                {saving ? t('builder.saving') : t('builder.save')}
              </button>
              <span className={clsx('text-xs', dirty ? 'text-amber-300' : 'text-slate-500')}>
                {dirty ? t('builder.unsaved') : state.next.lineup ? t('builder.savedState') : ''}
              </span>
            </div>
            {!state.next.lineup && state.running.lineup && <p className="text-xs text-slate-500">{t('rounds.repeat')}</p>}
          </section>

          {/* ── Market ── */}
          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-white">{t('market.title')}</h2>
              <span className="text-xs text-slate-500">{t('market.count', { count: state.market.length })}</span>
            </div>
            {state.market.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">{t('market.empty')}</p>
            ) : (
              <>
                {!state.marketComplete && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{t('market.incomplete', { count: state.market.length })}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative min-w-[12rem] flex-1">
                    <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={query}
                      onChange={e => { setQuery(e.target.value); setShown(PAGE); }}
                      placeholder={t('market.search')}
                      aria-label={t('market.search')}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-sm text-white outline-none focus:border-emerald-500"
                    />
                  </label>
                  <div className="flex gap-1">
                    {(['form', 'price', 'name'] as const).map(key => (
                      <button key={key} onClick={() => setSort(key)} aria-pressed={sort === key}
                        className={clsx('rounded-lg border px-2.5 py-1.5 text-xs font-bold', sort === key ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400 hover:text-white')}>
                        {t(`market.sort.${key}`)}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={onlyOwned} onChange={e => { setOnlyOwned(e.target.checked); setShown(PAGE); }} className="accent-emerald-500" />
                    {t('market.onlyOwned')}
                  </label>
                </div>

                {market.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">{t('market.noResults')}</p>
                ) : (
                  <ul className="divide-y divide-slate-800">
                    {market.slice(0, shown).map(m => {
                      const picked = picks.includes(m.id);
                      const isSelf = m.id === state.selfCardId;
                      const tooExpensive = !picked && m.price > left;
                      const disabled = picked || isSelf || full || tooExpensive;
                      return (
                        <li key={m.id} className={clsx('flex items-center gap-3 py-2', picked && 'opacity-50')}>
                          <Avatar dev={m} size={36} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">
                              {m.name} <span className="font-normal text-slate-500">@{m.githubUsername}</span>
                            </p>
                            <p className="text-[11px]">
                              <span className={RARITY_TEXT[m.rarity] ?? 'text-slate-400'}>{m.rarity}</span>
                              {m.primaryLanguage && <span className="text-slate-500"> · {m.primaryLanguage}</span>}
                              <span className="text-slate-400"> · {t('market.form', { points: m.form })}</span>
                              {m.owned !== 'none' && <span className="text-emerald-300"> · {t(m.owned === 'shiny' ? 'market.shiny' : 'market.owned')}</span>}
                            </p>
                          </div>
                          <span className="w-12 text-right font-mono text-sm font-bold text-yellow-300">{t('market.price', { price: m.price })}</span>
                          <button
                            onClick={() => add(m.id)}
                            disabled={disabled}
                            title={isSelf ? t('market.you') : full && !picked ? t('market.full') : tooExpensive ? t('market.tooExpensive') : t('market.add', { name: m.name })}
                            aria-label={t('market.add', { name: m.name })}
                            className="rounded-lg border border-emerald-500/40 p-1.5 text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent"
                          >
                            <Plus size={16} weight="bold" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {market.length > shown && (
                  <button onClick={() => setShown(s => s + PAGE)} className="w-full rounded-lg border border-slate-700 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">
                    {t('market.showMore')}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      ) : (
        <RoundView state={state} dayLabel={dayLabel} lastDay={lastDay} />
      )}
    </div>
  );
}

function RoundView({ state, dayLabel, lastDay }: { state: LeagueState; dayLabel: (iso: string) => string; lastDay: string }) {
  const t = useTranslations('league');
  const { running } = state;
  const lineup = running.lineup;

  const ranking = (rows: Ranked[]) => rows.length === 0
    ? <p className="text-sm text-slate-500">{t('round.noPlayers')}</p>
    : (
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={`${r.username}-${i}`} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', r.you ? 'bg-emerald-500/10' : '')}>
            <span className="w-6 text-right font-mono text-xs text-slate-500">{i + 1}</span>
            <UserAvatar username={r.username ?? '?'} image={r.image} size="sm" />
            <span className="flex-1 truncate font-bold text-white">{r.username}{r.you && <span className="ml-1 text-xs font-normal text-emerald-300">({t('round.you')})</span>}</span>
            <span className="font-mono text-sm text-emerald-300">{r.points}</span>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-white">{t('rounds.current', { start: dayLabel(running.startsAt), end: dayLabel(lastDay) })}</h2>
          {lineup && (
            <p className="text-sm">
              <span className="font-mono text-2xl font-black text-emerald-300">{t('round.points', { points: lineup.points })}</span>
              {running.position && <span className="ml-2 text-slate-400">{t('round.position', { position: running.position, players: running.players })}</span>}
            </p>
          )}
        </div>
        {!lineup ? (
          <p className="py-6 text-sm text-slate-400">{t('round.noLineup')}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {lineup.cards.map(c => {
                const isCaptain = c.id === lineup.captainId;
                const counted = c.score ? lineupDevPoints(c.score.points, isCaptain, c.owned) : null;
                return (
                  <li key={c.id} className={clsx('flex items-center gap-3 rounded-xl border p-3', isCaptain ? 'border-amber-400/50 bg-amber-500/5' : 'border-slate-800 bg-slate-800/30')}>
                    <Avatar dev={c} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-bold text-white">
                        {c.name}
                        {isCaptain && <Crown size={14} weight="fill" className="text-amber-300" aria-label={t('builder.captain', { times: LEAGUE_CAPTAIN_MULTIPLIER })} />}
                        {c.owned !== 'none' && <span className="text-[10px] font-normal text-emerald-300">{t(c.owned === 'shiny' ? 'market.shiny' : 'market.owned')}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {c.score
                          ? t('round.stats', { commits: c.score.commits, prs: c.score.pullRequests, reviews: c.score.reviews, issues: c.score.issues, days: c.score.activeDays })
                          : t('round.notScored')}
                      </p>
                    </div>
                    <span className="font-mono text-lg font-black text-white">{counted ?? '–'}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-slate-500">{t('round.partials')}</p>
          </>
        )}
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-white"><Users className="text-indigo-400" /> {t('round.friends')}</h3>
          {ranking(running.friends)}
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-white"><Trophy className="text-yellow-400" /> {t('round.top')}</h3>
          {ranking(running.top.map(r => ({ username: r.user.username, image: r.user.image, points: r.points })))}
        </section>
      </div>
    </div>
  );
}
