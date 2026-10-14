'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CaretDown, CaretUp, Stack } from '@phosphor-icons/react';
import { RARITY_ORDER } from '@/lib/rarity';
import type { SetProgress } from '@/lib/collections';
import { RarityGem } from '@/components/RarityGem';
import { useTranslations } from 'next-intl';

/**
 * Language sets of the collection: one slot per rarity in each combat language.
 * Complete sets unlock titles and frames (equipped on the profile).
 */
export function LanguageSets({ sets, profileHref }: { sets: SetProgress[]; profileHref?: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('collection.sets');
  const complete = sets.filter(s => s.complete).length;
  // Closest to done first, then alphabetical
  const sorted = [...sets].sort((a, b) => b.owned.length - a.owned.length || a.language.localeCompare(b.language));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-xl">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="flex items-center gap-3">
          <Stack size={22} weight="fill" className="text-fuchsia-400" />
          <span>
            <span className="block text-lg font-black text-white">{t('title')}</span>
            <span className="block text-xs text-slate-400">
              {t('summary', { complete, total: sets.length })}
            </span>
          </span>
        </span>
        {open ? <CaretUp size={18} className="text-slate-400" /> : <CaretDown size={18} className="text-slate-400" />}
      </button>

      {open && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map(set => (
              <div
                key={set.language}
                className={`flex items-center gap-3 rounded-lg border p-3 ${set.complete ? 'border-fuchsia-500/40 bg-fuchsia-500/5' : 'border-slate-800 bg-slate-950/50'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{set.language}</span>
                  <span className={`text-[11px] ${set.complete ? 'text-fuchsia-300' : 'text-slate-500'}`}>
                    {set.complete ? t('complete', { language: set.language }) :`${Math.round(set.share * 100)}%`}
                  </span>
                </span>
                <span className="flex gap-1">
                  {RARITY_ORDER.map(r => (
                    <span key={r} className={set.owned.includes(r) ? '' : 'opacity-20 grayscale'} title={set.owned.includes(r) ? r : t('missing', { rarity: r })}>
                      <RarityGem rarity={r} size={14} />
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {t.rich('forgeHint', { link: chunks => <Link href="/forge" className="text-indigo-300 hover:underline">{chunks}</Link> })}
            {profileHref && <>{' '}{t.rich('profileHint', { link: chunks => <Link href={profileHref} className="text-indigo-300 hover:underline">{chunks}</Link> })}</>}
          </p>
        </>
      )}
    </div>
  );
}
