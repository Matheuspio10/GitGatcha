import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { RankBadge } from '@/components/RankBadge';
import { RARITY_HEX } from '@/lib/shareCard';
import { getLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ id: string }> };

async function loadChallenge(id: string) {
  return prisma.battle.findUnique({
    where: { id },
    select: {
      id: true, status: true, isOpen: true, stake: true, expiresAt: true, defenderId: true, challengerTeam: true,
      challenger: { select: { id: true, username: true, rating: true } },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [challenge, t] = await Promise.all([loadChallenge(id), getTranslations('public.challenge')]);
  if (!challenge) return { title: t('notFound') };
  const who = challenge.challenger.username ?? t('aPlayer');
  return {
    title: t('metaTitle', { who }),
    description: challenge.stake ? t('metaDescriptionStake', { who, stake: challenge.stake }) : t('metaDescription', { who }),
  };
}

/** Landing page of a challenge link: who sent it, what is at stake, and how to accept. */
export default async function ChallengeLinkPage({ params }: Props) {
  const { id } = await params;
  const [challenge, user, t, locale] = await Promise.all([loadChallenge(id), getCurrentUser(), getTranslations('public.challenge'), getLocale()]);
  if (!challenge) notFound();

  const who = challenge.challenger.username ?? t('aPlayer');
  const rarities = (Array.isArray(challenge.challengerTeam) ? challenge.challengerTeam as { rarity?: string }[] : []).map(c => c.rarity ?? 'Common');
  const expired = !!challenge.expiresAt && challenge.expiresAt < new Date();
  const open = challenge.status === 'PENDING' && !expired && (challenge.isOpen ? !challenge.defenderId : challenge.defenderId === user?.id);
  const isOwn = user?.id === challenge.challenger.id;

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <p className="text-5xl">⚔️</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold text-white">{t('title', { who })}</h1>
      <div className="mt-3 flex justify-center"><RankBadge rating={challenge.challenger.rating} /></div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('theirTeam')}</p>
        <div className="mt-2 flex gap-2">
          {rarities.map((r, i) => (
            <span key={i} className="rounded-lg border px-3 py-1 text-sm font-bold" style={{ color: RARITY_HEX[r], borderColor: `${RARITY_HEX[r] ?? '#888'}66` }}>{r}</span>
          ))}
        </div>
        {challenge.stake > 0 && (
          <p className="mt-4 text-sm text-slate-300">
            {t.rich('stake', { stake: challenge.stake, total: challenge.stake * 2, b: chunks => <strong className="text-yellow-300">{chunks}</strong> })}
          </p>
        )}
        {challenge.expiresAt && !expired && (
          <p className="mt-2 text-xs text-slate-500">{t('expires', { date: `${challenge.expiresAt.toLocaleString(locale, { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC` })}</p>
        )}
      </div>

      <div className="mt-6">
        {!open ? (
          <p className="text-slate-400">{t('closed')}</p>
        ) : isOwn ? (
          <p className="text-slate-400">{t('own')}</p>
        ) : user ? (
          <Link
            href={`/battle?respond=${encodeURIComponent(challenge.id)}&from=${encodeURIComponent(who)}`}
            className="btn-brand inline-block px-8 py-3 font-bold text-white"
          >
            {t('accept')}
          </Link>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">{t('signInToAccept')}</p>
            <div className="flex justify-center gap-2">
              <Link href="/login?register=true" className="btn-brand px-6 py-2.5 font-bold text-white">{t('createAccount')}</Link>
              <Link href="/login" className="rounded-xl border border-slate-700 px-6 py-2.5 font-bold text-slate-200 hover:bg-slate-800">{t('signIn')}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
