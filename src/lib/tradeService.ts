import { prisma } from './prisma';
import { spendBits } from './bitsLedger';
import { UserFacingError, withUserLock, type Tx } from './userLock';
import { pushNotification } from './notifications';
import { areFriends } from './challengeService';
import { cardsInPendingChallenges, lockPlayers, moveCard, ownedCardSelect } from './cardTransfer';
import { startOfUtcDay, transferBlock } from './gifts';
import {
  TRADE_DAILY_LIMIT,
  TRADE_MAX_CARDS,
  TRADE_MAX_PENDING,
  TRADE_MIN_LEVEL,
  effectiveStatus,
  tradeExpiry,
  tradeFee,
  tradeShapeError,
} from './trades';

/**
 * Card trades between friends (rules in trades.ts). A proposal reserves
 * nothing: when the receiver accepts, everything is checked again inside one
 * transaction holding both players' locks, then both fees are paid and the
 * copies move (cardTransfer.ts). Two accepts of the same trade can't both run.
 */

type Db = Tx | typeof prisma;
type Player = { id: string; username: string | null };

const cardInfoSelect = { id: true, name: true, rarity: true, avatarUrl: true, githubUsername: true, primaryLanguage: true } as const;

const acceptedToday = (db: Db, userId: string, now = new Date()) =>
  db.cardTrade.count({
    where: { status: 'ACCEPTED', respondedAt: { gte: startOfUtcDay(now) }, OR: [{ proposerId: userId }, { receiverId: userId }] },
  });

const name = (p: Player) => p.username ?? '?';

/**
 * Checks that `owner` holds every card of `cardIds` and may give it, and that
 * `getter` holds none of them. Returns the owner's copies.
 */
async function checkSide(db: Db, owner: Player, getter: Player, cardIds: string[]) {
  const [copies, busy, getterCopies] = await Promise.all([
    db.userCard.findMany({ where: { userId: owner.id, cardId: { in: cardIds } }, select: ownedCardSelect }),
    cardsInPendingChallenges(db, owner.id),
    db.userCard.findMany({ where: { userId: getter.id, cardId: { in: cardIds } }, select: { card: { select: { name: true } } } }),
  ]);
  if (copies.length !== cardIds.length) throw new UserFacingError('trades.cardGone', 409, { name: name(owner) });
  for (const copy of copies) {
    const block = transferBlock({ edition: copy.edition, inActiveTeam: copy.inActiveTeam, inPendingChallenge: busy.has(copy.id) });
    if (block) throw new UserFacingError(`trades.${block}`, 400, { card: copy.card.name, name: name(owner) });
  }
  if (getterCopies.length > 0) {
    throw new UserFacingError('trades.alreadyOwned', 400, { name: name(getter), card: getterCopies[0].card.name });
  }
  return copies;
}

async function findFriend(userId: string, username: string): Promise<Player & { level: number }> {
  const friend = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true, username: true, level: true },
  });
  if (!friend) throw new UserFacingError('trades.friendNotFound', 404);
  if (friend.id === userId) throw new UserFacingError('trades.self');
  if (!(await areFriends(userId, friend.id))) throw new UserFacingError('trades.notFriends', 403);
  return friend;
}

/** Sends a proposal: `offered` (the proposer's cards) for `requested` (the friend's). */
export async function proposeTrade(proposerId: string, toUsername: string, offered: string[], requested: string[]) {
  const shape = tradeShapeError(offered, requested);
  if (shape) throw new UserFacingError(`trades.${shape}`, 400, { max: TRADE_MAX_CARDS });

  const [receiver, proposer] = await Promise.all([
    findFriend(proposerId, toUsername),
    prisma.user.findUnique({ where: { id: proposerId }, select: { id: true, username: true, level: true, currency: true } }),
  ]);
  if (!proposer) throw new UserFacingError('common.userNotFound', 404);
  if (proposer.level < TRADE_MIN_LEVEL) throw new UserFacingError('trades.level', 400, { min: TRADE_MIN_LEVEL });
  if (receiver.level < TRADE_MIN_LEVEL) throw new UserFacingError('trades.friendLevel', 400, { name: name(receiver), min: TRADE_MIN_LEVEL });

  const pending = await prisma.cardTrade.count({ where: { proposerId, status: 'PENDING', expiresAt: { gt: new Date() } } });
  if (pending >= TRADE_MAX_PENDING) throw new UserFacingError('trades.tooManyPending', 400, { max: TRADE_MAX_PENDING });

  const mine = await checkSide(prisma, proposer, receiver, offered);
  await checkSide(prisma, receiver, proposer, requested);
  // Not reserved: just a heads-up now, checked again (and paid) on acceptance
  const fee = tradeFee(mine.map(c => c.card.rarity));
  if (proposer.currency < fee) throw new UserFacingError('trades.cantAfford', 400, { fee });

  // The receiver's notification list is a JSON column: written under their lock
  return withUserLock(receiver.id, async (tx) => {
    const trade = await tx.cardTrade.create({
      data: { proposerId, receiverId: receiver.id, offeredCardIds: offered, requestedCardIds: requested, expiresAt: tradeExpiry(new Date()) },
      select: { id: true },
    });
    await pushNotification(tx, receiver.id, 'trade_offer',
      `${name(proposer)} proposed a trade: ${mine.map(c => c.card.name).join(', ')} for ${requested.length} of your cards.`, '/friends#trades');
    return { id: trade.id, fee };
  });
}

/** The player's open proposals (both ways) and the last finished ones, with card details and fees. */
export async function listTrades(userId: string, now = new Date()) {
  // Stale proposals are closed when someone looks
  await prisma.cardTrade.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: now }, OR: [{ proposerId: userId }, { receiverId: userId }] },
    data: { status: 'EXPIRED' },
  });
  const who = { select: { username: true, image: true } } as const;
  const [open, finished, today] = await Promise.all([
    prisma.cardTrade.findMany({
      where: { status: 'PENDING', OR: [{ proposerId: userId }, { receiverId: userId }] },
      include: { proposer: who, receiver: who },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cardTrade.findMany({
      where: { status: { not: 'PENDING' }, OR: [{ proposerId: userId }, { receiverId: userId }] },
      include: { proposer: who, receiver: who },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    acceptedToday(prisma, userId, now),
  ]);

  const cardIds = [...new Set([...open, ...finished].flatMap(t => [...t.offeredCardIds, ...t.requestedCardIds]))];
  const cards = new Map((await prisma.card.findMany({ where: { id: { in: cardIds } }, select: cardInfoSelect })).map(c => [c.id, c]));
  const cardsOf = (ids: string[]) => ids.map(id => cards.get(id)).filter(c => !!c);

  const view = (t: (typeof open)[number]) => {
    const outgoing = t.proposerId === userId;
    const youGive = cardsOf(outgoing ? t.offeredCardIds : t.requestedCardIds);
    const youGet = cardsOf(outgoing ? t.requestedCardIds : t.offeredCardIds);
    const accepted = t.status === 'ACCEPTED';
    return {
      id: t.id,
      direction: outgoing ? 'outgoing' as const : 'incoming' as const,
      status: t.status,
      other: outgoing ? t.receiver : t.proposer,
      youGive,
      youGet,
      yourFee: accepted ? (outgoing ? t.proposerFee : t.receiverFee) : tradeFee(youGive.map(c => c.rarity)),
      theirFee: accepted ? (outgoing ? t.receiverFee : t.proposerFee) : tradeFee(youGet.map(c => c.rarity)),
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      respondedAt: t.respondedAt?.toISOString() ?? null,
    };
  };

  return {
    open: open.map(view),
    finished: finished.map(view),
    limits: { dailyLimit: TRADE_DAILY_LIMIT, acceptedToday: today, maxPending: TRADE_MAX_PENDING, maxCards: TRADE_MAX_CARDS },
  };
}

export type TradeAction = 'accept' | 'decline' | 'cancel';

/** Accept or decline (the receiver), or cancel (the proposer) a pending trade. */
export async function respondTrade(userId: string, tradeId: string, action: TradeAction, now = new Date()) {
  const trade = await prisma.cardTrade.findUnique({
    where: { id: tradeId },
    include: { proposer: { select: { id: true, username: true } }, receiver: { select: { id: true, username: true } } },
  });
  if (!trade || (trade.proposerId !== userId && trade.receiverId !== userId)) throw new UserFacingError('trades.notFound', 404);
  if (action === 'cancel' ? trade.proposerId !== userId : trade.receiverId !== userId) throw new UserFacingError('trades.notYours', 403);

  const status = effectiveStatus(trade, now);
  if (status !== 'PENDING') throw new UserFacingError(status === 'EXPIRED' ? 'trades.expired' : 'trades.notPending', 409);

  if (action === 'cancel') {
    const { count } = await prisma.cardTrade.updateMany({ where: { id: tradeId, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: now } });
    if (count === 0) throw new UserFacingError('trades.notPending', 409);
    return { status: 'CANCELLED' };
  }

  if (action === 'decline') {
    return withUserLock(trade.proposerId, async (tx) => {
      const { count } = await tx.cardTrade.updateMany({ where: { id: tradeId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: now } });
      if (count === 0) throw new UserFacingError('trades.notPending', 409);
      await pushNotification(tx, trade.proposerId, 'trade_result', `${name(trade.receiver)} declined your trade.`, '/friends#trades');
      return { status: 'DECLINED' };
    });
  }

  return prisma.$transaction(async (tx) => {
    await lockPlayers(tx, [trade.proposerId, trade.receiverId]);
    // Claimed under both locks: a second accept finds it no longer pending
    const current = await tx.cardTrade.findUnique({ where: { id: tradeId }, select: { status: true, expiresAt: true } });
    const live = current && effectiveStatus(current, now);
    if (live !== 'PENDING') throw new UserFacingError(live === 'EXPIRED' ? 'trades.expired' : 'trades.notPending', 409);

    const players = await tx.user.findMany({ where: { id: { in: [trade.proposerId, trade.receiverId] } }, select: { id: true, level: true } });
    const levelOf = (id: string) => players.find(p => p.id === id)?.level ?? 1;
    if (levelOf(trade.receiverId) < TRADE_MIN_LEVEL) throw new UserFacingError('trades.level', 400, { min: TRADE_MIN_LEVEL });
    if (levelOf(trade.proposerId) < TRADE_MIN_LEVEL) throw new UserFacingError('trades.friendLevel', 400, { name: name(trade.proposer), min: TRADE_MIN_LEVEL });

    if (await acceptedToday(tx, trade.receiverId, now) >= TRADE_DAILY_LIMIT) throw new UserFacingError('trades.dailyLimit', 400, { limit: TRADE_DAILY_LIMIT });
    if (await acceptedToday(tx, trade.proposerId, now) >= TRADE_DAILY_LIMIT) {
      throw new UserFacingError('trades.friendDailyLimit', 400, { name: name(trade.proposer), limit: TRADE_DAILY_LIMIT });
    }

    const given = await checkSide(tx, trade.proposer, trade.receiver, trade.offeredCardIds);
    const taken = await checkSide(tx, trade.receiver, trade.proposer, trade.requestedCardIds);

    const proposerFee = tradeFee(given.map(c => c.card.rarity));
    const receiverFee = tradeFee(taken.map(c => c.card.rarity));
    const detail = (to: Player) => `Trade with ${name(to)}`;
    if (await spendBits(trade.proposerId, proposerFee, 'card_trade', { tx, detail: detail(trade.receiver) }) === null) {
      throw new UserFacingError('trades.friendCantAfford', 400, { name: name(trade.proposer) });
    }
    const balance = await spendBits(trade.receiverId, receiverFee, 'card_trade', { tx, detail: detail(trade.proposer) });
    if (balance === null) throw new UserFacingError('trades.cantAfford', 400, { fee: receiverFee });

    for (const copy of given) await moveCard(tx, copy, trade.receiverId);
    for (const copy of taken) await moveCard(tx, copy, trade.proposerId);

    await tx.cardTrade.update({ where: { id: tradeId }, data: { status: 'ACCEPTED', respondedAt: now, proposerFee, receiverFee } });
    await pushNotification(tx, trade.proposerId, 'trade_result',
      `${name(trade.receiver)} accepted your trade! You got ${taken.map(c => c.card.name).join(', ')}.`, '/collection');

    return { status: 'ACCEPTED', fee: receiverFee, balance, got: given.map(c => c.card.name) };
  }, { maxWait: 10_000, timeout: 20_000 });
}
