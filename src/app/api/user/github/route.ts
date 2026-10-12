import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTokenOwnerLogin } from '@/lib/githubService';
import { GITHUB_LINK_BONUS, SIGNATURE_EDITION } from '@/lib/githubLink';

// GET: GitHub connection status of the logged-in player
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [account, user, signature] = await Promise.all([
    prisma.account.findFirst({ where: { userId, provider: 'github' }, select: { access_token: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { githubBonusGranted: true } }),
    prisma.userCard.findFirst({
      where: { userId, edition: SIGNATURE_EDITION },
      select: { card: { select: { name: true, githubUsername: true, avatarUrl: true, rarity: true } } },
    }),
  ]);

  let login: string | null = null;
  let tokenValid = false;
  if (account?.access_token) {
    try {
      login = await getTokenOwnerLogin(account.access_token);
      tokenValid = login !== null;
    } catch {
      tokenValid = true; // GitHub unreachable/rate limited: don't report the token as broken
    }
  }

  return NextResponse.json({
    connected: !!account,
    tokenValid,
    login,
    bonus: GITHUB_LINK_BONUS,
    bonusGranted: !!user?.githubBonusGranted,
    signatureCard: signature?.card ?? null,
  });
}

// DELETE: disconnect GitHub (only if the player can still sign in another way)
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user, otherAccounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
    prisma.account.count({ where: { userId, provider: { not: 'github' } } }),
  ]);
  if (!user?.password && otherAccounts === 0) {
    return NextResponse.json({ error: 'GitHub is your only way to sign in, so it cannot be disconnected.' }, { status: 400 });
  }

  await prisma.account.deleteMany({ where: { userId, provider: 'github' } });
  return NextResponse.json({ success: true });
}
