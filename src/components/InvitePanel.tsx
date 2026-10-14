'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Gift } from '@phosphor-icons/react';
import { ShareButtons } from '@/components/ShareButtons';
import { inviteLink } from '@/lib/referral';
import { useTranslations } from 'next-intl';

const noSubscribe = () => () => {};

interface ReferralStats {
  invited: number;
  paid: number;
  waiting: number;
  cap: number;
  bonus: number;
  earned: number;
}

/** "Invite friends": the player's invite link and how many friends joined with it. */
export function InvitePanel({ username }: { username: string }) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const t = useTranslations('profile.invite');
  // The origin is only known in the browser ('' on the server render)
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => '');
  const link = origin ? inviteLink(origin, username) : '';

  useEffect(() => {
    fetch('/api/referrals', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(console.error);
  }, [username]);

  return (
    <div className="mb-8 rounded-2xl border border-commit/30 bg-commit/5 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Gift size={40} weight="duotone" className="shrink-0 text-commit" />
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">{t('title', { bonus: stats?.bonus ?? '…' })}</h2>
          <p className="text-sm text-slate-400">
            {stats ? t('textCap', { cap: stats.cap }) : t('text')}
          </p>
          {stats && stats.invited > 0 && (
            <p className="mt-1 text-xs text-slate-300">
              {t('stats', { invited: stats.invited, paid: stats.paid, earned: stats.earned })}
              {stats.waiting > 0 && ` · ${t('waiting', { waiting: stats.waiting })}`}
            </p>
          )}
        </div>
      </div>
      {link && (
        <div className="mt-4">
          <code className="mb-3 block truncate rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{link}</code>
          <ShareButtons url={link} text={t('shareText')} />
        </div>
      )}
    </div>
  );
}
