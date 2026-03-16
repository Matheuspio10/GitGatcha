import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, email: true, currency: true, level: true, xp: true, image: true },
  });

  if (!dbUser) return null;

  return {
    id: dbUser.id,
    username: (dbUser.username || session.user.name) as string,
    email: dbUser.email,
    currency: dbUser.currency,
    level: dbUser.level,
    xp: dbUser.xp,
    image: dbUser.image || null,
  };
}
