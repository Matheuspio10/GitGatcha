'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { ArrowsLeftRight, Coin } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { sizedAvatar } from '@/lib/avatarUrl';
import { UserAvatar } from '@/components/UserAvatar';

interface TradeCard { id: string; name: string; rarity: string; avatarUrl: string | null; githubUsername: string }

/** One trade as GET /api/trades answers it, from the viewer's side. */
interface TradeView {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  other: { username: string | null; image: string | null };
  youGive: TradeCard[];
  youGet: TradeCard[];
  yourFee: number;
  theirFee: number;
  expiresAt: string;
  respondedAt: string | null;
}

interface TradesResponse {
  open: TradeView[];
  finished: TradeView[];
  limits: { dailyLimit: number; acceptedToday: number; maxPending: number };
}

const RARITY_RING: Record<string, string> = {
  Common: 'border-slate-500', Uncommon: 'border-green-500', Rare: 'border-blue-500', Epic: 'border-purple-500', Legendary: 'border-yellow-400',
};

function CardChips({ cards }: { cards: TradeCard[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {cards.map(c => (
        <li key={c.id} className="flex items-center gap-1.5 rounded-lg bg-slate-800/70 py-1 pl-1 pr-2">
          <img src={sizedAvatar(c.avatarUrl || `https://github.com/${c.githubUsername}.png`, 24)} alt="" width={24} height={24} className={clsx('h-6 w-6 rounded-md border-2 object-cover', RARITY_RING[c.rarity] ?? 'border-slate-500')} loading="lazy" />
          <span className="max-w-[9rem] truncate text-xs font-bold text-white">{c.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The player's card trades on the Friends page: proposals received (accept /
 * decline), proposals sent (cancel) and the last finished ones. New trades are
 * proposed from the collection comparison with a friend.
 */
export function TradesPanel() {
  const t = useTranslations('social.trades');
  const locale = useLocale();
  const [data, setData] = useState<TradesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/trades', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then((json: TradesResponse | null) => { if (json) setData(json); })
      .catch(() => { /* the panel just stays hidden */ });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('trades:refresh', load);
    return () => window.removeEventListener('trades:refresh', load);
  }, [load]);

  const act = async (trade: TradeView, action: 'accept' | 'decline' | 'cancel') => {
    setBusy(trade.id);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t('failed'));
      } else {
        toast.success(t(`done.${action}`, { name: trade.other.username ?? '?' }));
        if (action === 'accept') window.dispatchEvent(new Event('bits:refresh'));
      }
    } catch {
      toast.error(t('failed'));
    } finally {
      setBusy(null);
      load();
    }
  };

  if (!data || (data.open.length === 0 && data.finished.length === 0)) {
    return (
      <div id="trades" className="scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-white"><ArrowsLeftRight className="text-amber-400" /> {t('title')}</h2>
        <p className="mt-2 text-sm text-slate-400">{t('empty')}</p>
      </div>
    );
  }

  const incoming = data.open.filter(tr => tr.direction === 'incoming');
  const outgoing = data.open.filter(tr => tr.direction === 'outgoing');
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const row = (tr: TradeView, actions: React.ReactNode) => (
    <li key={tr.id} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <div className="flex items-center gap-2">
        <UserAvatar username={tr.other.username ?? '?'} image={tr.other.image} size="sm" />
        <span className="font-bold text-white">{tr.other.username}</span>
        {tr.status === 'PENDING'
          ? <span className="ml-auto text-[10px] text-slate-500">{t('expires', { date: date(tr.expiresAt) })}</span>
          : <span className={clsx('ml-auto text-[10px] font-bold uppercase', tr.status === 'ACCEPTED' ? 'text-emerald-300' : 'text-slate-500')}>{t(`status.${tr.status as 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED'}`)}</span>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">{t('youGive')}</p>
          <CardChips cards={tr.youGive} />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">{t('youGet')}</p>
          <CardChips cards={tr.youGet} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-yellow-300"><Coin size={14} weight="fill" /> {t('yourFee', { fee: tr.yourFee })}</span>
        <span className="flex-1" />
        {actions}
      </div>
    </li>
  );

  const button = 'rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50';

  return (
    <div id="trades" className="scroll-mt-24 space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-white"><ArrowsLeftRight className="text-amber-400" /> {t('title')}</h2>
        <p className="mt-1 text-xs text-slate-400">{t('limits', { done: data.limits.acceptedToday, limit: data.limits.dailyLimit })}</p>
      </div>

      {incoming.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t('incoming', { count: incoming.length })}</h3>
          <ul className="space-y-3">
            {incoming.map(tr => row(tr, (
              <>
                <button onClick={() => act(tr, 'decline')} disabled={busy === tr.id} className={clsx(button, 'border border-slate-600 text-slate-300 hover:bg-slate-700')}>{t('decline')}</button>
                <button onClick={() => act(tr, 'accept')} disabled={busy === tr.id} className={clsx(button, 'bg-emerald-600 text-white hover:bg-emerald-500')}>{t('accept')}</button>
              </>
            )))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t('outgoing', { count: outgoing.length })}</h3>
          <ul className="space-y-3">
            {outgoing.map(tr => row(tr, (
              <button onClick={() => act(tr, 'cancel')} disabled={busy === tr.id} className={clsx(button, 'border border-slate-600 text-slate-300 hover:bg-slate-700')}>{t('cancel')}</button>
            )))}
          </ul>
        </section>
      )}

      {data.finished.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white">{t('history', { count: data.finished.length })}</summary>
          <ul className="mt-3 space-y-3">{data.finished.map(tr => row(tr, null))}</ul>
        </details>
      )}
    </div>
  );
}
