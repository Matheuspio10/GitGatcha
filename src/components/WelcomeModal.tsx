'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarCheck, Crosshair, Sword, ArrowFatLinesUp, Trophy, GithubLogo, Hammer, ShieldStar, ListChecks, Gift, X,
} from '@phosphor-icons/react';
import type { EarnIcon, EarnWay } from '@/lib/earnGuide';
import { useDialog } from '@/lib/useDialog';
import { useTranslations } from 'next-intl';

const ICONS: Record<EarnIcon, React.ElementType> = {
  checklist: ListChecks,
  calendar: CalendarCheck,
  target: Crosshair,
  swords: Sword,
  level: ArrowFatLinesUp,
  trophy: Trophy,
  github: GithubLogo,
  forge: Hammer,
  shield: ShieldStar,
};

/**
 * Shown once, right after a new player picks their username: the starter pack
 * gift and every way to earn BITS and packs.
 */
export function WelcomeModal({ username, starterPackName, guestCards, guide }: { username: string; starterPackName: string; guestCards: number; guide: EarnWay[] }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const openButton = useRef<HTMLButtonElement>(null);
  const t = useTranslations('onboarding.welcome');

  // Focus the main action without scrolling the dialog away from its top
  useEffect(() => { openButton.current?.focus({ preventScroll: true }); }, []);

  // Saved before navigating, so the next page render doesn't show the welcome again
  const close = async (then?: string) => {
    setOpen(false);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'welcome-seen' }),
      });
      window.dispatchEvent(new Event('onboarding:refresh'));
    } catch (err) {
      console.error(err);
    }
    if (then) router.push(then);
  };
  const panelRef = useDialog(open, () => close());

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-labelledby="welcome-title"
            initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 shadow-2xl"
          >
            <button onClick={() => close()} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label={t('close')}>
              <X size={20} />
            </button>

            <h2 id="welcome-title" className="font-display text-2xl sm:text-3xl font-extrabold text-white pr-8">
              {t.rich('title', {
                username,
                name: chunks => <span className="bg-gradient-to-r from-brand-a to-brand-b bg-clip-text text-transparent">{chunks}</span>,
              })}
            </h2>
            <p className="mt-2 text-slate-300">
              {t('intro')}
            </p>

            <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-commit/40 bg-commit/10 p-4">
              <Gift size={40} weight="duotone" className="shrink-0 text-commit" />
              <div className="flex-1">
                <p className="font-bold text-white">{starterPackName}</p>
                <p className="text-sm text-slate-300">{t('starterPack')}</p>
                {guestCards > 0 && (
                  <p className="mt-1 text-sm text-commit">{t('guestCards', { count: guestCards })}</p>
                )}
              </div>
              <button onClick={() => close('/inventory')} ref={openButton} className="btn-brand w-full sm:w-auto px-5 py-2.5 font-bold text-white">
                {t('openNow')}
              </button>
            </div>

            <h3 className="mt-6 mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{t('waysToEarn')}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {guide.map(way => {
                const Icon = ICONS[way.icon];
                return (
                  <li key={way.title}>
                    <Link
                      href={way.href}
                      onClick={() => close()}
                      className="flex h-full gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 transition-colors hover:border-slate-600 hover:bg-slate-800"
                    >
                      <Icon size={22} weight="duotone" className="mt-0.5 shrink-0 text-indigo-300" />
                      <span>
                        <span className="block text-sm font-bold text-white">{way.title}</span>
                        <span className="block text-xs text-slate-400 leading-relaxed">{way.text}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <button onClick={() => close()} className="mt-6 w-full rounded-xl border border-slate-700 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800">
              {t('gotIt')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
