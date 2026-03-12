import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import ForgeClient from './ForgeClient';
import { prisma } from '@/lib/prisma';

export const metadata = {
  title: 'GitGacha | The Forge',
  description: 'Invoke specific developer cards using fragments.',
};

export default async function ForgePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, currency: true }
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar username={user?.username || ''} currency={user?.currency || 0} />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <ForgeClient />
      </main>
    </div>
  );
}
