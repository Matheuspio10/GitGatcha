import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock, UserFacingError, asRecord, asArray } from '@/lib/userLock';
import { enforceRateLimit } from '@/lib/rateLimit';
import { WILDCARD, WILDCARD_EXCHANGE_RATE, maxWildcardsFrom } from '@/lib/fragments';

/** Buys `wildcards` wildcard fragments with WILDCARD_EXCHANGE_RATE× as many fragments of `language`. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, 'forge-exchange', 30, 60, userId);
  if (limited) return limited;

  const { language, wildcards } = await req.json();
  if (typeof language !== 'string' || !Number.isInteger(wildcards) || wildcards < 1) {
    return NextResponse.json({ error: 'Choose a language and how many wildcards' }, { status: 400 });
  }

  try {
    const fragments = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { fragments: true, fragmentLogs: true } });
      if (!user) throw new UserFacingError('User not found', 404);
      const wallet = asRecord(user.fragments);
      if (wildcards > maxWildcardsFrom(wallet, language)) throw new UserFacingError(`Not enough ${language} fragments`);

      const spent = wildcards * WILDCARD_EXCHANGE_RATE;
      wallet[language] -= spent;
      wallet[WILDCARD] = (wallet[WILDCARD] || 0) + wildcards;
      const logs = asArray(user.fragmentLogs);
      const date = new Date().toISOString();
      logs.unshift({ date, source: `Exchange for ${wildcards} wildcard`, language, amount: -spent });
      logs.unshift({ date, source: `Exchange from ${language}`, language: WILDCARD, amount: wildcards });
      await tx.user.update({ select: { id: true }, where: { id: userId }, data: { fragments: wallet, fragmentLogs: logs } });
      return wallet;
    });
    return NextResponse.json({ success: true, fragments });
  } catch (err) {
    if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Exchange error:', err);
    return NextResponse.json({ error: 'Exchange failed' }, { status: 500 });
  }
}
