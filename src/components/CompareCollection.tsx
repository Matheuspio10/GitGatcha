'use client';

import { sizedAvatar } from '@/lib/avatarUrl';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { useDialog } from '@/lib/useDialog';
import { useTranslations } from 'next-intl';

interface MiniCard {
  id: string;
  githubUsername: string;
  name: string;
  rarity: string;
  avatarUrl: string | null;
  primaryLanguage: string | null;
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

      {data && list && (
        <>
          <div className="flex gap-2 px-5 pt-4">
            {(['theirs', 'mine'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${side === s ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}
              >
                {s === 'theirs' ? t('theirs', { count: data.onlyTheirs.total }) : t('mine', { count: data.onlyMine.total })}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {list.total === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{side === 'theirs' ? t('nothingTheirs') : t('nothingMine')}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.cards.map(c => (
                  <li key={c.id}>
                    <Link href={`/card/${c.githubUsername}`} target="_blank" className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-2 hover:border-slate-600">
                      <img src={sizedAvatar(c.avatarUrl || `https://github.com/${c.githubUsername}.png`, 36)} alt="" width={36} height={36} className="rounded-lg" loading="lazy" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">{c.name}</span>
                        <span className={`block text-xs ${RARITY_TEXT[c.rarity] ?? 'text-slate-400'}`}>{c.rarity}{c.primaryLanguage ? ` · ${c.primaryLanguage}` : ''}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {list.total > list.cards.length && (
              <p className="mt-3 text-center text-xs text-slate-500">{t('showing', { shown: list.cards.length, total: list.total })}</p>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
