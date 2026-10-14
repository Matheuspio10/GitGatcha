import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withUserLock, UserFacingError, asRecord, asArray } from '@/lib/userLock';
import { enforceRateLimit } from '@/lib/rateLimit';
import { WILDCARD, WILDCARD_EXCHANGE_RATE, maxWildcardsFrom } from '@/lib/fragments';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const bodySchema = z.object({
  language: z.string({ error: 'forge.exchangeInvalid' }).min(1, { error: 'forge.exchangeInvalid' }).max(100, { error: 'forge.exchangeInvalid' }),
  wildcards: z.number({ error: 'forge.exchangeInvalid' }).int({ error: 'forge.exchangeInvalid' }).min(1, { error: 'forge.exchangeInvalid' }).max(1_000_000, { error: 'forge.exchangeInvalid' }),
}, { error: 'forge.exchangeInvalid' });

/** Buys `wildcards` wildcard fragments with WILDCARD_EXCHANGE_RATE× as many fragments of `language`. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'forge-exchange', 30, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { language, wildcards } = body.data;

  try {
    const fragments = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { fragments: true, fragmentLogs: true } });
      if (!user) throw new UserFacingError('common.userNotFound', 404);
      const wallet = asRecord(user.fragments);
      if (wildcards > maxWildcardsFrom(wallet, language)) throw new UserFacingError('forge.notEnoughLanguageFragments', 400, { language });

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
    return routeError(err, 'forge.exchangeFailed', 'Exchange error');
  }
}
