'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { useFormatter, useTranslations } from 'next-intl';
import { GithubLogo } from '@phosphor-icons/react';
import { Card } from '@/components/Card';
import type { DevRemovalStatus } from '@/lib/devRemovalService';

type Status = DevRemovalStatus | { state: 'loading' } | { state: 'error' };

const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50';

export function RemoveCardClient({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('public.devRemoval');
  const format = useFormatter();
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    fetch('/api/dev-removal')
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(setStatus)
      .catch(() => setStatus({ state: 'error' }));
  }, [signedIn]);

  const signInWithGithub = () => signIn('github', { callbackUrl: window.location.href });

  if (!signedIn) {
    return (
      <>
        <p className="mb-4 text-sm">{t('proveText')}</p>
        <button onClick={signInWithGithub} className={`${button} bg-white text-slate-900 hover:bg-slate-200`}>
          <GithubLogo size={18} weight="fill" /> {t('signIn')}
        </button>
      </>
    );
  }

  if (status.state === 'loading') return <p className="text-sm text-slate-500">…</p>;
  if (status.state === 'error') return <p className="text-sm text-red-400">{t('error')}</p>;

  if (status.state === 'noGithub') {
    return (
      <>
        <p className="mb-4 text-sm">{t('loggedInNoGithub')}</p>
        <button onClick={() => signOut({ callbackUrl: '/remove-my-card' })} className={`${button} bg-slate-700 text-white hover:bg-slate-600`}>
          {t('signOut')}
        </button>
      </>
    );
  }

  if (status.state === 'removed') {
    return (
      <p className="text-sm text-emerald-300">
        {t.rich('done', { login: status.login, date: format.dateTime(new Date(status.removedAt), { dateStyle: 'long' }), b: c => <b>{c}</b> })}
      </p>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dev-removal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('error'));
      setStatus({ state: 'removed', login: data.login, removedAt: new Date().toISOString() });
    } catch (err) {
      setError((err as Error).message || t('error'));
    } finally {
      setBusy(false);
    }
  };

  const { card, login, owners } = status;
  return (
    <>
      <p className="mb-4 text-sm">{t.rich('youAre', { login, b: c => <b className="text-white">{c}</b> })}</p>
      {card ? (
        <div className="mb-5 flex flex-col items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('yourCard')}</p>
          <div className="w-56">
            <Card
              id={card.id}
              githubUsername={login}
              name={card.name}
              avatarUrl={card.avatarUrl ?? ''}
              flavorText={card.flavorText}
              atk={card.atk}
              def={card.def}
              hp={card.hp}
              rarity={card.rarity}
              primaryLanguage={card.primaryLanguage ?? 'Unknown'}
              disableLink
            />
          </div>
          <p className="text-xs text-slate-500">{t('owners', { count: owners })}</p>
        </div>
      ) : (
        <p className="mb-5 text-sm">{t('noCard')}</p>
      )}
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
        <span>{t('confirm', { login })}</span>
      </label>
      <button onClick={remove} disabled={!confirmed || busy} className={`${button} bg-red-600 text-white hover:bg-red-500`}>
        {busy ? t('removing') : t('remove')}
      </button>
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
    </>
  );
}
