import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getUserMissions } from '@/lib/economyService';
import StoreClient from './StoreClient';

export default async function StorePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  const missions = await getUserMissions(user.id);

  return <StoreClient userCurrency={user.currency} initialMissions={missions} />;
}
