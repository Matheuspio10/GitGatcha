'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Gift, Coin, ArrowLeft } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { UserAvatar } from '@/components/UserAvatar';
import { GIFT_DAILY_RECEIVE_LIMIT, GIFT_MIN_LEVEL, type GiftBlock } from '@/lib/gifts';

/** What GET /api/gifts answers for one card. */
interface GiftOptions {
  card: { id: string; name: string; rarity: string; isShiny: boolean; trainingLevel: number; loyaltyCount: number };
  fee: number;
  block: GiftBlock | null;
  sentToday: number;
  dailyLimit: number;
  friends: { id: string; username: string; image: string | null; ownsCard: boolean; full: boolean }[];
}

/**
 * Giving one of the player's cards to a friend: the fee and the daily limit,
 * the friends who can get it, then a confirmation that says what stays behind.
 * `friend` skips the list (the "you have, they don't" comparison).
 */
export function GiftPanel({ cardId, friend, onGiven, compact = false }: {
  cardId: string;
  friend?: string;
  onGiven: (friend: string) => void;
  compact?: boolean;
}) {
  const t = useTranslations('collection.gift');
  const [options, setOptions] = useState<GiftOptions | null>(null);
  const [failed, setFailed] = useState(false);
  // Without a preset friend the panel starts closed (a button), so opening a card costs no request
  const [open, setOpen] = useState(!!friend);
  const [chosen, setChosen] = useState<string | null>(friend ?? null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`/api/gifts?cardId=${encodeURIComponent(cardId)}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then((data: GiftOptions) => { if (alive) setOptions(data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, cardId]);

  const send = async () => {
    if (!chosen || !options) return;
    setSending(true);
    try {
      const res = await fetch('/api/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, toUsername: chosen }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('failed'));
        return;
      }
      window.dispatchEvent(new Event('bits:refresh'));
      toast.success(t('sent', { card: options.card.name, friend: data.receiver ?? chosen }));
      onGiven(data.receiver ?? chosen);
    } catch {
      toast.error(t('failed'));
    } finally {
      setSending(false);
    }
  };

  const shell = clsx('w-full rounded-2xl border border-pink-500/30 bg-slate-900 text-sm', compact ? 'p-4' : 'p-6 shadow-2xl');
  const title = (
    <h3 className="flex items-center gap-2 text-sm font-bold text-white">
      <Gift size={16} weight="fill" className="text-pink-400" /> {t('title')}
    </h3>
  );

  if (!open) {
    return (
      <div className={shell}>
        {title}
        <p className="mt-2 text-xs text-slate-400">{t('intro')}</p>
        <button
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl bg-pink-600/90 px-4 py-2.5 font-bold text-white transition-colors hover:bg-pink-500"
        >
          {t('start')}
        </button>
      </div>
    );
  }

  if (failed) return <div className={shell}>{title}<p className="mt-3 text-rose-300">{t('loadFailed')}</p></div>;
  if (!options) return <div className={shell}>{title}<p className="mt-3 animate-pulse text-slate-500">{t('loading')}</p></div>;

  const left = Math.max(0, options.dailyLimit - options.sentToday);
  const header = (
    <>
      {title}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1 font-bold text-yellow-300"><Coin size={14} weight="fill" /> {t('fee', { fee: options.fee })}</span>
        <span>{t('dailyLeft', { left, limit: options.dailyLimit })}</span>
      </p>
    </>
  );

  if (options.block) {
    return (
      <div className={shell}>
        {header}
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
          {t(`blocked.${options.block}`, { min: GIFT_MIN_LEVEL, limit: options.dailyLimit })}
        </p>
      </div>
    );
  }

  const target = chosen ? options.friends.find(f => f.username.toLowerCase() === chosen.toLowerCase()) : null;

  // Confirmation: what the friend gets and what stays behind
  if (chosen) {
    const problem = !target ? t('notFriend', { friend: chosen })
      : target.ownsCard ? t('owns', { friend: target.username })
      : target.full ? t('full', { friend: target.username, limit: GIFT_DAILY_RECEIVE_LIMIT })
      : null;
    return (
      <div className={shell}>
        {header}
        <p className="mt-4 font-bold text-white">{t('confirmTitle', { card: options.card.name, friend: target?.username ?? chosen })}</p>
        {problem ? (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">{problem}</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300">
            <li>{t('confirmLoses')}</li>
            {options.card.isShiny && <li>{t('confirmShiny')}</li>}
            {options.card.trainingLevel > 0 && <li className="text-amber-200">{t('confirmTraining', { level: options.card.trainingLevel })}</li>}
            {options.card.loyaltyCount > 0 && <li className="text-amber-200">{t('confirmLoyalty', { count: options.card.loyaltyCount })}</li>}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          {!friend && (
            <button onClick={() => setChosen(null)} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-4 py-2 font-bold text-slate-300 hover:bg-slate-800">
              <ArrowLeft size={14} /> {t('back')}
            </button>
          )}
          {!problem && (
            <button
              onClick={send}
              disabled={sending}
              className="flex-1 rounded-xl bg-pink-600 px-4 py-2 font-bold text-white transition-colors hover:bg-pink-500 disabled:opacity-50"
            >
              {sending ? t('sending') : t('confirm', { fee: options.fee })}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {header}
      {options.friends.length === 0 ? (
        <p className="mt-3 text-slate-400">
          {t('noFriends')} <Link href="/friends" className="font-bold text-indigo-300 hover:underline">{t('findFriends')}</Link>
        </p>
      ) : (
        <>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('choose')}</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {options.friends.map(f => {
              const unavailable = f.ownsCard || f.full;
              return (
                <li key={f.id}>
                  <button
                    onClick={() => setChosen(f.username)}
                    disabled={unavailable}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <UserAvatar username={f.username} image={f.image} size="sm" />
                    <span className="flex-1 truncate font-bold text-white">{f.username}</span>
                    {f.ownsCard && <span className="text-[10px] text-slate-400">{t('ownsShort')}</span>}
                    {!f.ownsCard && f.full && <span className="text-[10px] text-slate-400">{t('fullShort')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
