import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getWeeklyEvent } from '@/lib/weeklyEventService';
import { getTranslations } from 'next-intl/server';
import ForgeClient from './ForgeClient';

export async function generateMetadata() {
  const t = await getTranslations('forge.meta');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function ForgePage({ searchParams }: { searchParams: Promise<{ dev?: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const now = new Date();
  const [{ dev }, event] = await Promise.all([searchParams, getWeeklyEvent(now).catch(() => null)]);

  return (
    <ForgeClient
      initialDev={typeof dev === 'string' ? dev : undefined}
      featuredDev={event?.featuredDev
        ? { ...event.featuredDev, discountPercent: event.discountPercent, endsInMs: event.endsAt.getTime() - now.getTime() }
        : null}
    />
  );
}
