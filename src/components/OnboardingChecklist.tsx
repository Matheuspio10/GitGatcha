'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { CaretDown, CheckCircle, Circle, ListChecks, X } from '@phosphor-icons/react';
import type { OnboardingStepId, OnboardingStepView } from '@/lib/onboarding';
import { useTranslations } from 'next-intl';
import { useGameText } from '@/i18n/gameText';

interface Status {
  steps: OnboardingStepView[];
  complete: boolean;
  dismissed: boolean;
  welcomeSeen: boolean;
}

const COLLAPSED_KEY = 'gg:onboarding-collapsed';

/**
 * Floating "Getting started" checklist for new players: 4 first steps, each
 * paying BITS once. Refreshes on every page change and after BITS changes.
 */
export function OnboardingChecklist() {
  const { status: authStatus } = useSession();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [claiming, setClaiming] = useState<OnboardingStepId | null>(null);
  const t = useTranslations('onboarding.checklist');
  const game = useGameText('game');
  const stepTitle = (step: OnboardingStepView) => game(`onboardingSteps.${step.id}.title`, step.title);

  useEffect(() => {
    // Collapsed by default on phones (it would cover half the screen), open on desktop
    let stored: string | null = null;
    try { stored = localStorage.getItem(COLLAPSED_KEY); } catch { /* storage unavailable */ }
    setCollapsed(stored === null ? window.matchMedia('(max-width: 639px)').matches : stored === '1');
  }, []);

  const load = useCallback(() => {
    fetch('/api/onboarding', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => setStatus(data?.onboarding ?? null))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') load();
  }, [authStatus, pathname, load]);

  // 'bits:refresh' follows packs, battles and claims; 'onboarding:refresh' the welcome screen and the collection
  useEffect(() => {
    window.addEventListener('bits:refresh', load);
    window.addEventListener('onboarding:refresh', load);
    return () => {
      window.removeEventListener('bits:refresh', load);
      window.removeEventListener('onboarding:refresh', load);
    };
  }, [load]);

  const post = async (body: object) => {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('error'));
    return data;
  };

  const claim = async (step: OnboardingStepView) => {
    setClaiming(step.id);
    try {
      const data = await post({ action: 'claim', step: step.id });
      toast.success(t('claimed', { bits: data.bits, step: stepTitle(step) }));
      window.dispatchEvent(new Event('bits:refresh'));
      if (data.onboarding?.complete) toast.success(t('complete'), { icon: '🎉' });
      setStatus(data.onboarding);
    } catch (err) {
      toast.error((err as Error).message);
      load();
    } finally {
      setClaiming(null);
    }
  };

  const dismiss = () => {
    setStatus(null);
    post({ action: 'dismiss' }).catch(console.error);
  };

  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  };

  // The welcome screen comes first; finished or dismissed checklists go away
  if (!status || !status.welcomeSeen || status.complete || status.dismissed) return null;

  const claimedCount = status.steps.filter(s => s.claimed).length;
  const nextStep = status.steps.find(s => !s.claimed);

  return (
    <motion.aside
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-[calc(1rem+var(--bottom-nav-h))] right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur"
      aria-label={t('title')}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={toggle} className="flex flex-1 items-center gap-2 text-left" aria-expanded={!collapsed}>
          <ListChecks size={20} weight="duotone" className="text-commit" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-white">{t('title')}</span>
            <span className="block text-[11px] text-slate-400">{t('progress', { done: claimedCount, total: status.steps.length })}{collapsed && nextStep ? ` · ${t('next', { step: stepTitle(nextStep) })}` : ''}</span>
          </span>
          <CaretDown size={16} className={`text-slate-400 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={dismiss} className="rounded p-1 text-slate-500 hover:text-white" aria-label={t('hide')} title={t('hide')}>
          <X size={14} />
        </button>
      </div>

      <div className="h-1 bg-slate-800">
        <div className="h-full bg-commit transition-all" style={{ width: `${(claimedCount / status.steps.length) * 100}%` }} />
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.ol
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            {status.steps.map(step => (
              <li key={step.id} className="flex items-start gap-3 border-t border-slate-800 px-4 py-3">
                {step.claimed
                  ? <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-commit" />
                  : <Circle size={20} className={`mt-0.5 shrink-0 ${step.done ? 'text-commit' : 'text-slate-500'}`} />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${step.claimed ? 'text-slate-500 line-through' : 'text-white'}`}>{stepTitle(step)}</p>
                  {!step.claimed && <p className="text-xs text-slate-400">{game(`onboardingSteps.${step.id}.description`, step.description)}</p>}
                </div>
                {!step.claimed && (step.done ? (
                  <button
                    onClick={() => claim(step)}
                    disabled={claiming !== null}
                    className="shrink-0 rounded-lg bg-commit px-2.5 py-1 text-xs font-bold text-slate-950 hover:brightness-110 disabled:opacity-60"
                  >
                    {claiming === step.id ? '…' : `+${step.rewardBits}`}
                  </button>
                ) : (
                  <Link href={step.href} className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800">
                    {t('go')}
                  </Link>
                ))}
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
