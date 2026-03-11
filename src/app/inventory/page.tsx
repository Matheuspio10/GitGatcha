import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import InventoryClient from './InventoryClient';

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  return <InventoryClient userId={user.id} />;
}
