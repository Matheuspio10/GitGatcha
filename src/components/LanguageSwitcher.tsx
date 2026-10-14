'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Translate } from '@phosphor-icons/react';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, LOCALE_SHORT, type Locale } from '@/i18n/locales';

/** Interface language picker: stores the choice in a cookie and re-renders the page in it. */
export function LanguageSwitcher({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <label className={`flex items-center gap-1.5 text-slate-400 ${className}`}>
      <Translate size={18} aria-hidden />
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        aria-label={t('language')}
        disabled={pending}
        onChange={e => change(e.target.value as Locale)}
        className="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs font-bold text-slate-200 hover:border-slate-500 disabled:opacity-60"
      >
        {LOCALES.map(l => <option key={l} value={l} title={LOCALE_LABELS[l]}>{compact ? LOCALE_SHORT[l] : LOCALE_LABELS[l]}</option>)}
      </select>
    </label>
  );
}
