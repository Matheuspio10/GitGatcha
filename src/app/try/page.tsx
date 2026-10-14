import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getPackById } from '@/lib/packDefinitions';
import { GUEST_PACK_ID } from '@/lib/guestPack';
import { STARTER_PACK_ID } from '@/lib/onboarding';
import { getTranslations } from 'next-intl/server';
import { getGameText } from '@/i18n/gameText.server';
import TryClient from './TryClient';

export async function generateMetadata() {
  const t = await getTranslations('public.try');
  return { title: t('metaTitle') };
}

/** One free booster for visitors, before creating an account. */
export default async function TryPage() {
  if (await getCurrentUser()) redirect('/inventory');
  const pack = getPackById(GUEST_PACK_ID);
  const starterPack = getPackById(STARTER_PACK_ID);
  const [t, packText] = await Promise.all([getTranslations('public.try'), getGameText('gamePacks')]);
  return (
    <TryClient
      packName={pack ? packText(`packs.${pack.id}.name`, pack.name) : t('fallbackPack')}
      packTheme={pack?.visualTheme ?? null}
      cardCount={pack?.cardCount ?? 5}
      starterPackName={starterPack ? packText(`packs.${starterPack.id}.name`, starterPack.name) : t('fallbackStarter')}
    />
  );
}
