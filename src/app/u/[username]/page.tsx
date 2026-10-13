import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { ShareButtons } from '@/components/ShareButtons';
import { RankBadge } from '@/components/RankBadge';
import { RARITY_HEX, getShareProfile, siteUrl } from '@/lib/shareCard';
import { getCurrentUser } from '@/lib/session';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getShareProfile(decodeURIComponent(username));
  if (!profile) return { title: 'Player not found · GitGacha' };
  const description = `Level ${profile.level} · ${profile.uniqueCards} developers collected · rating ${profile.rating}. Collect real developers from GitHub on GitGacha.`;
  return {
    title: `${profile.username} · GitGacha`,
    description,
    openGraph: { title: `${profile.username} on GitGacha`, description, url: `${siteUrl()}/u/${profile.username}` },
    twitter: { card: 'summary_large_image', title: `${profile.username} on GitGacha`, description },
  };
}

/** Public, shareable player page (no login). The full profile stays at /profile/<username>. */
export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const [profile, viewer] = await Promise.all([getShareProfile(decodeURIComponent(username)), getCurrentUser()]);
  if (!profile) notFound();
  const url = `${siteUrl()}/u/${profile.username}`;
  const cardProps = (c: (typeof profile.topCards)[number]) => ({
    ...c, avatarUrl: c.avatarUrl ?? '', primaryLanguage: c.primaryLanguage ?? 'Unknown', disableLink: true,
  });

  return (
    <div className="mx-auto max-w-5xl py-6">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <UserAvatar username={profile.username} image={profile.image} size="lg" />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold text-white">{profile.username}</h1>
          <p className="flex flex-wrap items-center justify-center gap-2 text-slate-400 sm:justify-start">
            Level {profile.level} · <RankBadge rating={profile.rating} /> · {profile.uniqueCards} developers collected
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs font-mono sm:justify-start">
            {Object.entries(profile.byRarity).map(([rarity, count]) => (
              <span key={rarity} style={{ color: RARITY_HEX[rarity] }}>{rarity} {count}</span>
            ))}
          </div>
        </div>
        <ShareButtons url={url} text={`${profile.username}'s GitGacha collection: ${profile.uniqueCards} developers`} />
      </div>

      {profile.signatureCard && (
        <section className="mt-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-fuchsia-300">Signature card</h2>
          <div className="w-[min(16rem,80vw)]"><Card {...cardProps(profile.signatureCard)} /></div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Best cards</h2>
        {profile.topCards.length === 0 ? (
          <p className="text-slate-500">No cards yet.</p>
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
          <Link href={`/profile/${profile.username}`} className="text-sm text-indigo-300 hover:underline">See the full profile →</Link>
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-commit/40 bg-commit/10 p-5">
            <p className="font-bold text-white">Start your own collection</p>
            <p className="mt-1 text-sm text-slate-300">Open a free pack of real GitHub developers, no account needed.</p>
            <Link href="/try" className="btn-brand mt-4 inline-block px-6 py-2.5 font-bold text-white">Open a free pack</Link>
          </div>
        )}
      </div>
    </div>
  );
}
