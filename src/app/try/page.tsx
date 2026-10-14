import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getPackById } from '@/lib/packDefinitions';
import { GUEST_PACK_ID } from '@/lib/guestPack';
import { STARTER_PACK_ID } from '@/lib/onboarding';
import { getTranslations } from 'next-intl/server';
import TryClient from './TryClient';

export async function generateMetadata() {
  const t = await getTranslations('public.try');
  return { title: t('metaTitle') };
}

/** One free booster for visitors, before creating an account. */
export default async function TryPage() {
  if (await getCurrentUser()) redirect('/inventory');
  const pack = getPackById(GUEST_PACK_ID);
  const t = await getTranslations('public.try');
  return (
    <TryClient
      packName={pack?.name ?? t('fallbackPack')}
      packTheme={pack?.visualTheme ?? null}
      cardCount={pack?.cardCount ?? 5}
      starterPackName={getPackById(STARTER_PACK_ID)?.name ?? t('fallbackStarter')}
    />
  );
}
