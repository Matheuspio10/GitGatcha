import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { ShareButtons } from '@/components/ShareButtons';
import { RankBadge } from '@/components/RankBadge';
import { AvatarFrame, PlayerTitle } from '@/components/PlayerCosmetics';
import { RARITY_HEX, getShareProfile, siteUrl } from '@/lib/shareCard';
import { getCurrentUser } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const [profile, t] = await Promise.all([getShareProfile(decodeURIComponent(username)), getTranslations('public.player')]);
  if (!profile) return { title: t('notFound') };
  const description = t('metaDescription', { level: profile.level, count: profile.uniqueCards, rating: profile.rating });
  const ogTitle = t('ogTitle', { username: profile.username });
  return {
    title: `${profile.username} · GitGacha`,
    description,
    openGraph: { title: ogTitle, description, url: `${siteUrl()}/u/${profile.username}` },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  };
}

/** Public, shareable player page (no login). The full profile stays at /profile/<username>. */
export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const [profile, viewer, t] = await Promise.all([getShareProfile(decodeURIComponent(username)), getCurrentUser(), getTranslations('public.player')]);
  if (!profile) notFound();
  const url = `${siteUrl()}/u/${profile.username}`;
  const cardProps = (c: (typeof profile.topCards)[number]) => ({
    ...c, avatarUrl: c.avatarUrl ?? '', primaryLanguage: c.primaryLanguage ?? 'Unknown', disableLink: true,
  });

  return (
    <div className="mx-auto max-w-5xl py-6">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <AvatarFrame frame={profile.frame}>
          <UserAvatar username={profile.username} image={profile.image} size="lg" />
        </AvatarFrame>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold text-white">{profile.username}</h1>
          <PlayerTitle title={profile.title} className="block" />
          <p className="flex flex-wrap items-center justify-center gap-2 text-slate-400 sm:justify-start">
            {t('level', { level: profile.level })} · <RankBadge rating={profile.rating} /> · {t('collected', { count: profile.uniqueCards })}
            {profile.setsCompleted > 0 && <> · {t('setsComplete', { count: profile.setsCompleted })}</>}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs font-mono sm:justify-start">
            {Object.entries(profile.byRarity).map(([rarity, count]) => (
              <span key={rarity} style={{ color: RARITY_HEX[rarity] }}>{rarity} {count}</span>
            ))}
          </div>
        </div>
        <ShareButtons url={url} text={t('shareText', { username: profile.username, count: profile.uniqueCards })} />
      </div>

      {profile.seasons.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{t('pastSeasons')}</h2>
          <div className="flex flex-wrap gap-2">
            {profile.seasons.map(s => (
              <span key={s.seasonId} className="inline-flex items-center gap-2 text-xs text-slate-400">
                {t('seasonShort', { season: s.seasonId })} <RankBadge rating={s.peakRating} />
              </span>
            ))}
          </div>
        </section>
      )}

      {profile.signatureCard && (
        <section className="mt-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-fuchsia-300">{t('signatureCard')}</h2>
          <div className="w-[min(16rem,80vw)]"><Card {...cardProps(profile.signatureCard)} /></div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">{t('bestCards')}</h2>
        {profile.topCards.length === 0 ? (
          <p className="text-slate-500">{t('noCards')}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] justify-items-center gap-6">
            {profile.topCards.map(c => (
              <Link key={c.id} href={`/card/${c.githubUsername}`} className="w-full max-w-[16rem]">
                <Card {...cardProps(c)} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 text-center">
        {viewer ? (
          <Link href={`/profile/${profile.username}`} className="text-sm text-indigo-300 hover:underline">{t('fullProfile')}</Link>
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-commit/40 bg-commit/10 p-5">
            <p className="font-bold text-white">{t('ctaTitle')}</p>
            <p className="mt-1 text-sm text-slate-300">{t('ctaText')}</p>
            <Link href="/try" className="btn-brand mt-4 inline-block px-6 py-2.5 font-bold text-white">{t('ctaButton')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
