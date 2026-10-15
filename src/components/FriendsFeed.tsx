'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Lightning, Medal, Sparkle, Trophy, CastleTurret } from '@phosphor-icons/react';
import { UserAvatar } from '@/components/UserAvatar';
import { RarityGem } from '@/components/RarityGem';
import { useGameText } from '@/i18n/gameText';
import { sizedAvatar } from '@/lib/avatarUrl';
import { sprintKindLabel, sprintThemeById, type SprintKind } from '@/lib/sprints';
import { FEED_WINDOW_DAYS, type FeedEvent } from '@/lib/activityFeed';

const RARITY_TEXT: Record<string, string> = {
  Rare: 'text-blue-400', Epic: 'text-purple-400', Legendary: 'text-yellow-400',
};

/** What the player's friends pulled and won lately (GET /api/feed). */
export function FriendsFeed({ hasFriends }: { hasFriends: boolean }) {
  const t = useTranslations('social.feed');
  const format = useFormatter();
  const achText = useGameText('gameAchievements');
  const battleText = useGameText('gameBattle');
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  // "3 minutes ago" is measured from when the feed loaded
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasFriends) return;
    let cancelled = false;
    fetch('/api/feed')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => { if (!cancelled) { setEvents(data.events ?? []); setLoadedAt(new Date()); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [hasFriends]);

  const who = (username: string) => function UserLink(chunks: ReactNode) {
    return <Link href={`/profile/${username}`} className="font-bold text-white hover:text-indigo-300">{chunks}</Link>;
  };

  const line = (e: FeedEvent): ReactNode => {
    const tags = { who: who(e.user.username), user: e.user.username };
    switch (e.type) {
      case 'pull':
        return t.rich(e.shiny ? 'pullShiny' : 'pull', {
          ...tags, name: e.name,
          card: chunks => <Link href={`/card/${e.login}`} className={`font-bold hover:underline ${RARITY_TEXT[e.rarity] ?? 'text-slate-200'}`}>{chunks}</Link>,
        });
      case 'achievement':
        return t.rich('achievement', {
          ...tags,
          achievement: achText(`achievements.${e.achievementId}.name`, e.achievementName),
          tier: achText(`tiers.${e.tier}`, achText('tiers.fallback', `Tier ${e.tier}`, { tier: e.tier })),
        });
      case 'sprint': {
        const theme = sprintThemeById(e.themeId);
        const themeName = theme.id.startsWith('family:')
          ? battleText(`sprints.families.${theme.id}.name`, theme.name)
          : battleText('sprints.languageTheme.name', theme.name, { language: theme.languages[0] ?? theme.id.replace(/^lang:/, '') });
        const kind = e.kind as SprintKind;
        return t.rich('sprint', {
          ...tags, position: e.position,
          sprint: battleText(`sprints.kinds.${kind}.label`, sprintKindLabel(kind)),
          theme: themeName,
        });
      }
      case 'tower':
        return t.rich('tower', { ...tags, tower: battleText('tower.name', `The ${e.theme} Gauntlet`, { theme: e.theme }) });
    }
  };

  const icon = (e: FeedEvent) => {
    if (e.type === 'pull') {
      return e.avatarUrl
        ? <img src={sizedAvatar(e.avatarUrl, 32)} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover" loading="lazy" />
        : <RarityGem rarity={e.rarity} size={20} />;
    }
    const Icon = e.type === 'achievement' ? Medal : e.type === 'sprint' ? Trophy : CastleTurret;
    return <Icon size={22} weight="fill" className={e.type === 'achievement' ? 'text-amber-400' : e.type === 'sprint' ? 'text-emerald-400' : 'text-rose-400'} />;
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6" aria-labelledby="friends-feed-title">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 id="friends-feed-title" className="text-xl font-bold text-white flex items-center gap-2">
          <Lightning className="text-amber-400" weight="fill" /> {t('title')}
        </h2>
        <span className="text-xs text-slate-500">{t('subtitle', { days: FEED_WINDOW_DAYS })}</span>
      </div>

      {!hasFriends ? (
        <p className="text-sm text-slate-500">{t('noFriends')}</p>
      ) : failed ? (
        <p className="text-sm text-red-300">{t('error')}</p>
      ) : events === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-800/50" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {events.map(e => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3">
              <UserAvatar username={e.user.username} image={e.user.image} size="sm" />
              <p className="min-w-0 flex-1 text-sm text-slate-300">
                {line(e)}
                {e.type === 'pull' && <span className="ml-1 inline-flex translate-y-0.5"><RarityGem rarity={e.rarity} size={12} title={e.rarity} /></span>}
                {e.type === 'pull' && e.shiny && <Sparkle size={12} weight="fill" className="ml-1 inline text-yellow-300" aria-hidden />}
                <span className="block text-xs text-slate-500">
                  <time dateTime={e.at}>{format.relativeTime(new Date(e.at), loadedAt ?? undefined)}</time>
                </span>
              </p>
              <span className="grid h-8 w-8 shrink-0 place-items-center">{icon(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
