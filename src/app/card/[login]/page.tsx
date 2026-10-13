import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/Card';
import { ShareButtons } from '@/components/ShareButtons';
import { getShareCard, siteUrl } from '@/lib/shareCard';
import { getCurrentUser } from '@/lib/session';
import { cardPassive } from '@/lib/battleConfig';

type Props = { params: Promise<{ login: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { login } = await params;
  const card = await getShareCard(decodeURIComponent(login));
  if (!card) return { title: 'Card not found · GitGacha' };
  const description = `${card.rarity} · ${card.title} · ATK ${card.atk} / DEF ${card.def} / HP ${card.hp}. Collect real developers from GitHub on GitGacha.`;
  return {
    title: `${card.name} · GitGacha`,
    description,
    openGraph: { title: `${card.name} on GitGacha`, description, url: `${siteUrl()}/card/${card.githubUsername}` },
    twitter: { card: 'summary_large_image', title: `${card.name} on GitGacha`, description },
  };
}

/** Public page of one developer card (shareable, no login). */
export default async function CardPage({ params }: Props) {
  const { login } = await params;
  const [card, user] = await Promise.all([getShareCard(decodeURIComponent(login)), getCurrentUser()]);
  if (!card) notFound();

  const passive = cardPassive(card.primaryLanguage, card.rarity);
  const url = `${siteUrl()}/card/${card.githubUsername}`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 py-6 md:flex-row md:items-start">
      <div className="w-[min(18rem,85vw)] shrink-0">
        <Card {...card} avatarUrl={card.avatarUrl ?? ''} primaryLanguage={card.primaryLanguage ?? 'Unknown'} edition={card.signatureOwner ? 'signature' : undefined} disableLink />
      </div>

      <div className="flex-1 text-center md:text-left">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500">Developer card</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-white">{card.name}</h1>
        <a href={`https://github.com/${card.githubUsername}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-300 hover:underline">
          @{card.githubUsername} on GitHub
        </a>
        <p className="mt-3 text-lg font-bold text-white">{card.rarity} · {card.title}</p>
        {card.titleReason && <p className="text-sm text-slate-400">{card.titleReason}</p>}
        <p className="mt-3 text-sm text-slate-300"><strong>{passive.name}:</strong> {passive.desc}</p>
        <p className="mt-3 text-sm text-slate-400">
          {card.signatureOwner
            ? <>The Signature edition belongs to <Link href={`/u/${card.signatureOwner}`} className="text-fuchsia-300 hover:underline">@{card.signatureOwner}</Link>, the developer themself.</>
            : <>In {card.owners} player collection{card.owners === 1 ? '' : 's'}.</>}
        </p>

        <div className="mt-6">
          <ShareButtons url={url} text={`${card.name} is a ${card.rarity} card on GitGacha`} />
        </div>

        {!user && (
          <div className="mt-8 rounded-2xl border border-commit/40 bg-commit/10 p-5">
            <p className="font-bold text-white">Collect real open-source developers</p>
            <p className="mt-1 text-sm text-slate-300">Open a free pack, no account needed.</p>
            <Link href="/try" className="btn-brand mt-4 inline-block px-6 py-2.5 font-bold text-white">Open a free pack</Link>
          </div>
        )}
      </div>
    </div>
  );
}
