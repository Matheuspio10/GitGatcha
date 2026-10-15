import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Trophy } from '@phosphor-icons/react/dist/ssr';
import { RARITY_HEX, siteUrl } from '@/lib/shareCard';
import { ShareButtons } from '@/components/ShareButtons';
import { getCurrentUser } from '@/lib/session';
import { sizedAvatar } from '@/lib/avatarUrl';
import { replayPath, swapSides, type ReplayCard } from '@/lib/battleReplay';
import { ReplayViewer } from './ReplayViewer';
import { loadReplay, replayLabels } from './replayView';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [replay, t] = await Promise.all([loadReplay(id), getTranslations('public.replay')]);
  if (!replay) return { title: t('notFound') };
  const { challengerName, defenderName, winnerName } = await replayLabels(replay);
  const description = t('metaDescription', { winner: winnerName });
  const ogTitle = t('ogTitle', { a: challengerName, b: defenderName });
  return {
    title: `${t('title', { a: challengerName, b: defenderName })} · GitGacha`,
    description,
    openGraph: { title: ogTitle, description, url: `${siteUrl()}${replayPath(replay.id)}` },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  };
}

function TeamColumn({ title, cards, won, winnerLabel }: { title: string; cards: ReplayCard[]; won: boolean; winnerLabel: string }) {
  return (
    <section className={`flex-1 rounded-2xl border p-4 ${won ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-slate-800 bg-slate-900/50'}`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
        {title}
        {won && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-yellow-300"><Trophy size={12} weight="fill" /> {winnerLabel}</span>}
      </h2>
      <ul className="space-y-2">
        {cards.map(c => (
          <li key={c.id} className="flex items-center gap-3">
            {c.avatarUrl
              ? <img src={sizedAvatar(c.avatarUrl, 40)} alt="" width={40} height={40} className="h-10 w-10 rounded-lg border-2 object-cover" style={{ borderColor: RARITY_HEX[c.rarity] ?? '#64748b' }} />
              : <span className="h-10 w-10 rounded-lg border-2 bg-slate-800" style={{ borderColor: RARITY_HEX[c.rarity] ?? '#64748b' }} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{c.name}</p>
              <p className="text-[11px] text-slate-400">
                <span style={{ color: RARITY_HEX[c.rarity] }}>{c.rarity}</span>
                {c.primaryLanguage && <> · {c.primaryLanguage}</>}
              </p>
            </div>
            <span className="font-mono text-[11px] text-slate-400">{c.atk}/{c.def}/{c.maxHp}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Public, shareable replay of a finished 3v3 battle (no login). */
export default async function ReplayPage({ params }: Props) {
  const { id } = await params;
  const [replay, viewer, t, locale] = await Promise.all([loadReplay(id), getCurrentUser(), getTranslations('public.replay'), getLocale()]);
  if (!replay) notFound();
  const { challengerName, defenderName, winnerName, league } = await replayLabels(replay);

  // Players watch from their own chair (their team at the bottom); everyone else from the challenger's
  const viewerIsDefender = !!viewer && replay.defender?.id === viewer.id;
  const viewerIsChallenger = !!viewer && replay.challenger.id === viewer.id;
  const shown = viewerIsDefender ? swapSides(replay) : replay;
  const names = viewerIsDefender
    ? { bottom: defenderName, top: challengerName }
    : { bottom: challengerName, top: defenderName };
  const url = `${siteUrl()}${replayPath(replay.id)}`;
  const shareText = t('shareText', { a: challengerName, b: defenderName });
  const date = replay.completedAt
    ? new Date(replay.completedAt).toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'UTC' })
    : null;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-400">{[league, date].filter(Boolean).join(' · ')}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-white sm:text-4xl">{t('title', { a: challengerName, b: defenderName })}</h1>
        <p className="mt-2 text-lg font-bold text-yellow-300">{t('won', { name: winnerName })}</p>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <TeamColumn title={t('teamOf', { name: challengerName })} cards={replay.challengerTeam} won={replay.winnerSide === 'CHALLENGER'} winnerLabel={t('winner')} />
        <TeamColumn title={t('teamOf', { name: defenderName })} cards={replay.defenderTeam} won={replay.winnerSide === 'DEFENDER'} winnerLabel={t('winner')} />
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <ReplayViewer
          replay={{ log: shown.log, challengerTeam: shown.challengerTeam, defenderTeam: shown.defenderTeam, winnerSide: shown.winnerSide, battleStats: shown.battleStats }}
          names={names}
          spectator={!viewerIsDefender && !viewerIsChallenger}
          shareUrl={url}
          shareText={shareText}
        />
        <ShareButtons url={url} text={shareText} />
      </div>

      <div className="mt-10 text-center">
        {viewer ? (
          <Link href="/battle" className="text-sm text-indigo-300 hover:underline">{t('backToArena')}</Link>
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
