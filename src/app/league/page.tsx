import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import LeagueClient from './LeagueClient';

export async function generateMetadata() {
  const t = await getTranslations('league');
  return { title: `${t('title')} · GitGacha`, description: t('subtitle') };
}

/** The Dev League: next round's market and lineup, the running round's partial points and rankings. */
export default async function LeaguePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  return <LeagueClient />;
}
