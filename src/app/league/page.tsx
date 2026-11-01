import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import LeagueClient, { type LeagueTab } from './LeagueClient';

export async function generateMetadata() {
  const t = await getTranslations('league');
  return { title: `${t('title')} · GitGacha`, description: t('subtitle') };
}

const TABS: readonly LeagueTab[] = ['lineup', 'round', 'groups'];

/**
 * The Dev League: next round's market and lineup, the running round's partial
 * points and rankings, private leagues. ?tab= opens a tab; ?join=CODE (an invite
 * link) opens the private leagues with the code looked up.
 */
export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ tab?: string; join?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  const { tab, join } = await searchParams;
  const joinCode = join?.slice(0, 20);
  const initialTab = joinCode ? 'groups' : TABS.find(t => t === tab) ?? 'lineup';
  return <LeagueClient initialTab={initialTab} joinCode={joinCode} />;
}
