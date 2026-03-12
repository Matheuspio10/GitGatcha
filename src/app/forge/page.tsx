import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ForgeClient from './ForgeClient';

export const metadata = {
  title: 'GitGacha | The Forge',
  description: 'Invoke specific developer cards using fragments.',
};

export default async function ForgePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  return <ForgeClient />;
}
