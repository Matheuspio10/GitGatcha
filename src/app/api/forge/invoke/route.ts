import { NextResponse } from 'next/server';
import { addBits } from '@/lib/bitsLedger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { randomInt } from 'node:crypto';
import { withUserLock, UserFacingError, asRecord, asArray } from '@/lib/userLock';
import { fetchGitHubUserStats, isValidGitHubLogin, toCardData } from '@/lib/githubService';
import { forgeCostFor, isFeaturedDev } from '@/lib/weeklyEvents';
import { getFeaturedDevLogin } from '@/lib/weeklyEventService';
import { SHINY_CHANCE, WILDCARD, planFragmentPayment } from '@/lib/fragments';
import { enforceRateLimit } from '@/lib/rateLimit';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const bodySchema = z.object({ username: z.string().trim().max(100).optional() }).optional();

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);

    // Each invocation also spends the server's GitHub quota
    const limited = await enforceRateLimit(req, 'forge-invoke', 20, 60, session.user.id);
    if (limited) return limited;

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const username = body.data?.username;
    if (!username) return apiError('forge.usernameRequired');
    if (!isValidGitHubLogin(username)) return apiError('forge.invalidUsername');

    const stats = await fetchGitHubUserStats(username);
    if (!stats) return apiError('forge.devNotFound', 404);
    // The Dev of the Week costs less this week
    const featured = isFeaturedDev(stats.githubUsername, await getFeaturedDevLogin());
    const { fragments, bits } = forgeCostFor(stats.rarity, featured);

    const userId = session.user.id;
    // Developers with no primary language are paid with wildcard fragments only
    const lang = stats.primaryLanguage || 'Unknown';

    const newCardStats = await withUserLock(userId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { currency: true, fragments: true, fragmentLogs: true },
      });
      if (!user) throw new UserFacingError('common.userNotFound', 404);

      const userFragments = asRecord(user.fragments);
      const payment = planFragmentPayment(userFragments, lang, fragments);
      if (!payment) throw new UserFacingError('common.notEnoughFragments');
      if (user.currency < bits) throw new UserFacingError('common.notEnoughBits');

      let card = await tx.card.findUnique({ where: { githubUsername: stats.githubUsername } });
      if (card && await tx.userCard.findFirst({ where: { userId, cardId: card.id }, select: { id: true } })) {
        throw new UserFacingError('forge.alreadyOwned');
      }
      if (!card) card = await tx.card.create({ data: toCardData(stats) });

      const logs = asArray(user.fragmentLogs);
      const spend = (language: string, amount: number) => {
        if (amount <= 0) return;
        userFragments[language] = (userFragments[language] || 0) - amount;
        logs.unshift({ date: new Date().toISOString(), source: `Invocation - ${stats.name || username}${featured ? ' (Dev of the Week)' : ''}`, language, amount: -amount });
      };
      spend(lang, payment.fromLanguage);
      spend(WILDCARD, payment.fromWildcard);

      await tx.user.update({
        select: { id: true },
        where: { id: userId },
        data: {
          fragments: userFragments,
          fragmentLogs: logs
        }
      });
      await addBits(userId, -bits, 'forge', { tx, detail: `${stats.name || username}${featured ? ' (Dev of the Week)' : ''}` });

      const isShiny = randomInt(0, 1_000_000) < SHINY_CHANCE * 1_000_000;
      const userCard = await tx.userCard.create({
        data: { userId, cardId: card.id, isShiny }
      });

      return { ...stats, isShiny, userCardId: userCard.id };
    });

    return NextResponse.json({ success: true, card: newCardStats });
  } catch (error) {
    return routeError(error, 'forge.invocationFailed', 'Invocation error');
  }
}
