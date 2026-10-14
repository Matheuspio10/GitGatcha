import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/Card';
import { ShareButtons } from '@/components/ShareButtons';
import { getShareCard, localizeShareCard, siteUrl } from '@/lib/shareCard';
import { getCurrentUser } from '@/lib/session';
import { cardPassive, cardPassiveMessage } from '@/lib/battleConfig';
import { getTranslations } from 'next-intl/server';
import { getGameText } from '@/i18n/gameText.server';

type Props = { params: Promise<{ login: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { login } = await params;
  const [found, t, game] = await Promise.all([getShareCard(decodeURIComponent(login)), getTranslations('public.card'), getGameText('game')]);
  if (!found) return { title: t('notFound') };
  const card = localizeShareCard(found, game);
  const description = t('metaDescription', { rarity: card.rarity, title: card.title, atk: card.atk, def: card.def, hp: card.hp });
  const ogTitle = t('ogTitle', { name: card.name });
  return {
    title: `${card.name} · GitGacha`,
    description,
    openGraph: { title: ogTitle, description, url: `${siteUrl()}/card/${card.githubUsername}` },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  };
}

/** Public page of one developer card (shareable, no login). */
export default async function CardPage({ params }: Props) {
  const { login } = await params;
  const [found, user, t, game, battleText] = await Promise.all([
    getShareCard(decodeURIComponent(login)), getCurrentUser(), getTranslations('public.card'), getGameText('game'), getGameText('gameBattle'),
  ]);
  if (!found) notFound();
  const card = localizeShareCard(found, game);

  const passiveEn = cardPassive(card.primaryLanguage, card.rarity);
  const passiveMsg = cardPassiveMessage(card.primaryLanguage, card.rarity);
  const passive = {
    name: battleText(`${passiveMsg.key}.name`, passiveEn.name),
    desc: battleText(`${passiveMsg.key}.desc`, passiveEn.desc, passiveMsg.values),
  };
  const url = `${siteUrl()}/card/${card.githubUsername}`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 py-6 md:flex-row md:items-start">
      <div className="w-[min(18rem,85vw)] shrink-0">
        <Card {...card} avatarUrl={card.avatarUrl ?? ''} primaryLanguage={card.primaryLanguage ?? 'Unknown'} edition={card.signatureOwner ? 'signature' : undefined} disableLink />
      </div>

      <div className="flex-1 text-center md:text-left">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500">{t('label')}</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-white">{card.name}</h1>
        <a href={`https://github.com/${card.githubUsername}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-300 hover:underline">
          {t('onGithub', { login: card.githubUsername })}
        </a>
        <p className="mt-3 text-lg font-bold text-white">{card.rarity} · {card.title}</p>
        {card.titleReason && <p className="text-sm text-slate-400">{card.titleReason}</p>}
        <p className="mt-3 text-sm text-slate-300"><strong>{passive.name}:</strong> {passive.desc}</p>
        <p className="mt-3 text-sm text-slate-400">
          {card.signatureOwner
            ? t.rich('signatureOwner', { owner: card.signatureOwner, link: chunks => <Link href={`/u/${card.signatureOwner}`} className="text-fuchsia-300 hover:underline">{chunks}</Link> })
            : t('owners', { count: card.owners })}
        </p>

        <div className="mt-6">
          <ShareButtons url={url} text={t('shareText', { name: card.name, rarity: card.rarity })} />
        </div>

        {!user && (
          <div className="mt-8 rounded-2xl border border-commit/40 bg-commit/10 p-5">
            <p className="font-bold text-white">{t('ctaTitle')}</p>
            <p className="mt-1 text-sm text-slate-300">{t('ctaText')}</p>
            <Link href="/try" className="btn-brand mt-4 inline-block px-6 py-2.5 font-bold text-white">{t('ctaButton')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
