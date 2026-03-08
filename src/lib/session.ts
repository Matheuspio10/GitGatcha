import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    username: session.user.username as string,
    email: session.user.email,
    currency: session.user.currency as number,
    level: 1, // simplified for now since we aren't joining full DB user here to save MS
    xp: 0
  };
}
