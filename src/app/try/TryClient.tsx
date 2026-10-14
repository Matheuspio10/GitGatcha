'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Gift, Sparkle } from '@phosphor-icons/react';
import { BoosterReveal, BoosterPackTheme } from '@/components/BoosterReveal';
import { Card, CardProps } from '@/components/Card';
import { useTranslations } from 'next-intl';

type Phase = 'loading' | 'idle' | 'opening' | 'revealing' | 'done';

export default function TryClient({ packName, packTheme, cardCount, starterPackName }: {
  packName: string;
  packTheme: BoosterPackTheme | null;
  cardCount: number;
  starterPackName: string;
}) {
  const t = useTranslations('public.try');
  const [phase, setPhase] = useState<Phase>('loading');
  const [cards, setCards] = useState<CardProps[]>([]);
  const [error, setError] = useState<string | null>(null);

  // A visitor who already opened their pack sees the same cards again
  useEffect(() => {
    fetch('/api/guest-pack', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.pull?.cards?.length) {
          setCards(data.pull.cards);
          setPhase('done');
        } else {
          setPhase('idle');
        }
      })
      .catch(() => setPhase('idle'));
  }, []);

  const open = async () => {
    setPhase('opening');
    setError(null);
    try {
      const res = await fetch('/api/guest-pack', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.pull?.cards?.length) throw new Error(data.error || t('openError'));
      setCards(data.pull.cards);
      setPhase(data.alreadyOpened ? 'done' : 'revealing');
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  };

  // The summary of the reveal leaves the page scrolled down: start the result at the top
  useEffect(() => {
    if (phase === 'done') window.scrollTo({ top: 0 });
  }, [phase]);

  if (phase === 'revealing') {
    return (
      <div className="w-full">
        <BoosterReveal
          cards={cards.map(c => ({ ...c, isDuplicate: false }))}
          packDropFragments={null}
          packName={packName}
          packTheme={packTheme}
          completeLabel={t('keepCards')}
          onComplete={() => setPhase('done')}
        />
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-5xl text-center">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">{t('doneTitle')}</h1>
        <p className="mt-3 text-slate-300">{t('doneText')}</p>

        <div className="my-8 flex flex-wrap justify-center gap-4">
          {cards.map(card => (
            <div key={card.githubUsername} className="w-[min(14rem,80vw)]">
              <Card {...card} disableLink />
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-md rounded-2xl border border-commit/40 bg-commit/10 p-6">
          <p className="flex items-center justify-center gap-2 font-bold text-white">
            <Gift size={22} weight="duotone" className="text-commit" /> {t('signUpKeep')}
          </p>
          <p className="mt-2 text-sm text-slate-300">{t('bonus', { starterPack: starterPackName })}</p>
          <Link href="/login?register=true" className="btn-brand mt-5 block w-full py-3 font-bold text-white">
            {t('createAccount')}
          </Link>
          <Link href="/login" className="mt-3 block text-sm text-slate-400 hover:text-white">
            {t('haveAccount')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
      <motion.div
        initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative mb-8 flex h-72 w-48 flex-col items-center justify-center rounded-2xl border-2 shadow-2xl"
        style={{ background: packTheme?.gradient, borderColor: packTheme?.border }}
        aria-hidden
      >
        <Sparkle size={40} weight="fill" style={{ color: packTheme?.accentColor }} />
        <span className="mt-4 px-4 font-display text-xl font-extrabold" style={{ color: packTheme?.textColor }}>{packName}</span>
        <span className="mt-2 font-mono text-xs text-slate-300">{t('cards', { count: cardCount })}</span>
      </motion.div>

      <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">{t('title')}</h1>
      <p className="mt-3 text-slate-300">
        {t('intro', { count: cardCount })}
      </p>

      {error && <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}

      <button
        onClick={open}
        disabled={phase !== 'idle'}
        className="btn-brand mt-8 w-full max-w-xs py-3.5 text-lg font-bold text-white disabled:opacity-60"
      >
        {phase === 'opening' ? t('drawing') : phase === 'loading' ? '…' : t('openCta')}
      </button>
      <Link href="/login" className="mt-4 text-sm text-slate-400 hover:text-white">{t('haveAccount')}</Link>
    </div>
  );
}
