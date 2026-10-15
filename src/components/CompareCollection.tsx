'use client';

import { sizedAvatar } from '@/lib/avatarUrl';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, ArrowLeft, ArrowsLeftRight, Check, Lock } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { TRADE_MAX_CARDS, tradeFee } from '@/lib/trades';
import { GiftPanel } from '@/components/GiftPanel';
import { useDialog } from '@/lib/useDialog';
import { useTranslations } from 'next-intl';

interface MiniCard {
  id: string;
  githubUsername: string;
  name: string;
  rarity: string;
  avatarUrl: string | null;
  primaryLanguage: string | null;
  /** Signature or in an active team: can't change hands. */
  locked?: boolean;
}

interface Comparison {
  friend: string;
  shared: number;
  onlyTheirs: { total: number; cards: MiniCard[] };
  onlyMine: { total: number; cards: MiniCard[] };
}

const RARITY_TEXT: Record<string, string> = {
  Common: 'text-slate-300', Uncommon: 'text-green-400', Rare: 'text-blue-400', Epic: 'text-purple-400', Legendary: 'text-yellow-400',
};

/** "They have, you don't" / "You have, they don't" with a friend. */
export function CompareCollection({ username, onClose }: { username: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {username && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* keyed by friend: a new comparison starts from a clean state */}
          <ComparePanel key={username} username={username} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ComparePanel({ username, onClose }: { username: string; onClose: () => void }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<'theirs' | 'mine'>('theirs');
  // A card of mine they don't have, being given to them
  const [giving, setGiving] = useState<MiniCard | null>(null);
  // Trade builder: card ids I'd give and card ids I'd get (null = not building a trade)
  const [trade, setTrade] = useState<{ give: string[]; get: string[] } | null>(null);
  const [proposing, setProposing] = useState(false);
  const panelRef = useDialog(true, onClose);
  const t = useTranslations('social.comparison');

  useEffect(() => {
    fetch(`/api/friends/compare?username=${encodeURIComponent(username)}`, { cache: 'no-store' })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || ''); // empty: the translated fallback is shown
        setData(json);
      })
      .catch(err => setError((err as Error).message));
  }, [username]);

  const list = data ? (side === 'theirs' ? data.onlyTheirs : data.onlyMine) : null;

  const picked = (id: string) => !!trade && (side === 'mine' ? trade.give : trade.get).includes(id);
  const togglePick = (id: string) => setTrade(prev => {
    if (!prev) return prev;
    const key = side === 'mine' ? 'give' : 'get';
    const current = prev[key];
    if (current.includes(id)) return { ...prev, [key]: current.filter(x => x !== id) };
    return current.length >= TRADE_MAX_CARDS ? prev : { ...prev, [key]: [...current, id] };
  });
  const rarityOf = (ids: string[], pool: MiniCard[]) => ids.map(id => pool.find(c => c.id === id)?.rarity ?? 'Common');
  const myFee = trade && data ? tradeFee(rarityOf(trade.give, data.onlyMine.cards)) : 0;
  const theirFee = trade && data ? tradeFee(rarityOf(trade.get, data.onlyTheirs.cards)) : 0;

  const propose = async () => {
    if (!trade) return;
    setProposing(true);
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUsername: username, offered: trade.give, requested: trade.get }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t('trade.failed'));
        return;
      }
      toast.success(t('trade.sent', { username }));
      window.dispatchEvent(new Event('trades:refresh'));
      setTrade(null);
    } catch {
      toast.error(t('trade.failed'));
    } finally {
      setProposing(false);
    }
  };

  return (
    <motion.div
      ref={panelRef}
      role="dialog" aria-modal="true" aria-label={t('ariaLabel', { username })}
      initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
      className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-slate-800 p-5">
        <div>
          <h3 className="text-xl font-black text-white">{t('title', { username })}</h3>
          {data && <p className="text-xs text-slate-400">{t('inCommon', { count: data.shared })}</p>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label={t('close')}><X size={20} /></button>
      </div>

      {error !== null && <p className="p-6 text-sm text-red-300">{error || t('error')}</p>}
      {!data && error === null && <div className="m-6 h-40 animate-pulse rounded-xl bg-slate-800/50" />}

      {data && giving && (
        <div className="flex-1 overflow-y-auto p-5">
          <button onClick={() => setGiving(null)} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white">
            <ArrowLeft size={14} /> {t('backToList')}
          </button>
          <GiftPanel
            cardId={giving.id}
            friend={username}
            compact
            onGiven={() => {
              setData(prev => prev && {
                ...prev,
                shared: prev.shared + 1,
                onlyMine: { total: prev.onlyMine.total - 1, cards: prev.onlyMine.cards.filter(c => c.id !== giving.id) },
              });
              setGiving(null);
            }}
          />
        </div>
      )}

      {data && list && !giving && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            {(['theirs', 'mine'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${side === s ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}
              >
                {s === 'theirs' ? t('theirs', { count: data.onlyTheirs.total }) : t('mine', { count: data.onlyMine.total })}
                {trade && <span className="ml-1 text-amber-300">({(s === 'mine' ? trade.give : trade.get).length}/{TRADE_MAX_CARDS})</span>}
              </button>
            ))}
            <button
              onClick={() => setTrade(prev => (prev ? null : { give: [], get: [] }))}
              className={clsx('ml-auto inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold',
                trade ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-300 hover:text-white')}
              aria-pressed={!!trade}
            >
              <ArrowsLeftRight size={14} weight="bold" /> {trade ? t('trade.stop') : t('trade.start')}
            </button>
          </div>
          {trade && <p className="px-5 pt-2 text-xs text-slate-400">{t('trade.hint', { max: TRADE_MAX_CARDS })}</p>}
          <div className="flex-1 overflow-y-auto p-5">
            {list.total === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{side === 'theirs' ? t('nothingTheirs') : t('nothingMine')}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.cards.map(c => {
                  const face = (
                    <>
                      <img src={sizedAvatar(c.avatarUrl || `https://github.com/${c.githubUsername}.png`, 36)} alt="" width={36} height={36} className="rounded-lg" loading="lazy" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-bold text-white">{c.name}</span>
                        <span className={`block text-xs ${RARITY_TEXT[c.rarity] ?? 'text-slate-400'}`}>{c.rarity}{c.primaryLanguage ? ` · ${c.primaryLanguage}` : ''}</span>
                      </span>
                    </>
                  );
                  if (trade) {
                    const on = picked(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => togglePick(c.id)}
                          disabled={c.locked}
                          aria-pressed={on}
                          className={clsx('flex w-full items-center gap-3 rounded-xl border p-2',
                            on ? 'border-amber-400/70 bg-amber-500/10' : 'border-slate-800 bg-slate-800/40 hover:border-slate-600',
                            c.locked && 'cursor-not-allowed opacity-50 hover:border-slate-800')}
                        >
                          {face}
                          {c.locked
                            ? <span className="inline-flex items-center gap-1 text-[10px] text-slate-400"><Lock size={12} /> {t('trade.locked')}</span>
                            : on && <Check size={18} weight="bold" className="text-amber-300" />}
                        </button>
                      </li>
                    );
                  }
                  return (
                  <li key={c.id} className="flex items-center gap-1">
                    <Link href={`/card/${c.githubUsername}`} target="_blank" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-2 hover:border-slate-600">
                      {face}
                    </Link>
                    {side === 'mine' && (
                      <button
                        onClick={() => setGiving(c)}
                        className="shrink-0 rounded-xl border border-pink-500/30 p-2.5 text-pink-300 hover:bg-pink-500/10"
                        title={t('give', { username })}
                        aria-label={t('giveCard', { card: c.name, username })}
                      >
                        <Gift size={18} weight="fill" />
                      </button>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
            {list.total > list.cards.length && (
              <p className="mt-3 text-center text-xs text-slate-500">{t('showing', { shown: list.cards.length, total: list.total })}</p>
            )}
          </div>
          {trade && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 p-4 text-xs">
              <div className="flex-1 space-y-0.5 text-slate-300">
                <p>{t('trade.summary', { give: trade.give.length, get: trade.get.length })}</p>
                <p className="text-slate-400">{t('trade.fees', { mine: myFee, theirs: theirFee, username })}</p>
              </div>
              <button
                onClick={propose}
                disabled={proposing || trade.give.length === 0 || trade.get.length === 0}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
              >
                {proposing ? t('trade.sending') : t('trade.send')}
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
