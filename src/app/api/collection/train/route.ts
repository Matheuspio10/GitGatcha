import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addBits } from '@/lib/bitsLedger';
import { withUserLock, UserFacingError, asRecord, asArray } from '@/lib/userLock';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { idSchema } from '@/lib/validation';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rateLimit';
import { WILDCARD, planFragmentPayment } from '@/lib/fragments';
import { maxTrainingLevel, trainingCost } from '@/lib/training';

const bodySchema = z.object({ userCardId: idSchema.optional() }).optional();

/**
 * Trains one of the player's cards one level: BITS plus fragments of the card's
 * language (wildcards cover the rest). Everything is checked and paid under the
 * player's lock, so two clicks can't skip a level or pay once for two.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'card-train', 30, 60, userId);
  if (limited) return limited;

  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const userCardId = body.data?.userCardId;
  if (!userCardId) return apiError('collection.cardRequired');

  try {
    const result = await withUserLock(userId, async (tx) => {
      const userCard = await tx.userCard.findFirst({
        where: { id: userCardId, userId },
        select: { id: true, trainingLevel: true, card: { select: { name: true, rarity: true, primaryLanguage: true } } },
      });
      if (!userCard) throw new UserFacingError('collection.cardNotInCollection', 404);

      const { card } = userCard;
      const cost = trainingCost(userCard.trainingLevel, card.rarity);
      if (!cost) throw new UserFacingError('collection.fullyTrained', 400, { name: card.name });

      const user = await tx.user.findUnique({ where: { id: userId }, select: { currency: true, fragments: true, fragmentLogs: true } });
      if (!user) throw new UserFacingError('common.userNotFound', 404);
      const wallet = asRecord(user.fragments);
      const lang = card.primaryLanguage || 'Unknown';
      const payment = planFragmentPayment(wallet, lang, cost.fragments);
      if (!payment) throw new UserFacingError('common.notEnoughFragments');
      if (user.currency < cost.bits) throw new UserFacingError('common.notEnoughBits');

      const level = userCard.trainingLevel + 1;
      const logs = asArray(user.fragmentLogs);
      const spend = (language: string, amount: number) => {
        if (amount <= 0) return;
        wallet[language] = (wallet[language] || 0) - amount;
        logs.unshift({ date: new Date().toISOString(), source: `Training - ${card.name} (level ${level})`, language, amount: -amount });
      };
      spend(lang, payment.fromLanguage);
      spend(WILDCARD, payment.fromWildcard);

      await tx.user.update({ select: { id: true }, where: { id: userId }, data: { fragments: wallet, fragmentLogs: logs } });
      const currency = await addBits(userId, -cost.bits, 'card_training', { tx, detail: `${card.name} → level ${level}` });
      await tx.userCard.update({ where: { id: userCard.id }, data: { trainingLevel: level } });

      return {
        trainingLevel: level,
        maxLevel: maxTrainingLevel(card.rarity),
        nextCost: trainingCost(level, card.rarity),
        currency,
        fragments: wallet,
      };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return routeError(err, 'collection.trainingFailed', 'Training error');
  }
}
