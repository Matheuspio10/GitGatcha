import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { getPackById } from '@/lib/packDefinitions';
import { GUEST_PACK_ID } from '@/lib/guestPack';
import { STARTER_PACK_ID } from '@/lib/onboarding';
import TryClient from './TryClient';

export const metadata = { title: 'Open a free pack · GitGacha' };

/** One free booster for visitors, before creating an account. */
export default async function TryPage() {
  if (await getCurrentUser()) redirect('/inventory');
  const pack = getPackById(GUEST_PACK_ID);
  return (
    <TryClient
      packName={pack?.name ?? 'Free pack'}
      packTheme={pack?.visualTheme ?? null}
      cardCount={pack?.cardCount ?? 5}
      starterPackName={getPackById(STARTER_PACK_ID)?.name ?? 'a starter pack'}
    />
  );
}
