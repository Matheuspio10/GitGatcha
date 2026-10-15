import { prisma } from './prisma';
import { spendBits } from './bitsLedger';
import { UserFacingError, type Tx } from './userLock';
import { inPendingChallenge, lockPlayers, moveCard, ownedCardSelect } from './cardTransfer';
import { pushNotification } from './notifications';
import { areFriends } from './challengeService';
import {
  GIFT_DAILY_RECEIVE_LIMIT,
  GIFT_DAILY_SEND_LIMIT,
  GIFT_MIN_LEVEL,
  giftBlock,
  giftFee,
  startOfUtcDay,
  type GiftBlock,
} from './gifts';

/**
 * Card gifts between friends (rules in gifts.ts). The sender's copy is removed
 * and the friend's created in one transaction that holds BOTH players' locks,
 * so a gift can't race a pack opening, a training, another gift or the fee.
 */

const sentToday = (db: Tx | typeof prisma, senderId: string, now = new Date()) =>
  db.cardGift.count({ where: { senderId, createdAt: { gte: startOfUtcDay(now) } } });

const receivedToday = (db: Tx | typeof prisma, receiverId: string, now = new Date()) =>
  db.cardGift.count({ where: { receiverId, createdAt: { gte: startOfUtcDay(now) } } });

/** What the gift dialog shows for one of the player's cards: the fee, what blocks it and each friend. */
export async function giftOptions(userId: string, cardId: string) {
  const owned = await prisma.userCard.findUnique({ where: { userId_cardId: { userId, cardId } }, select: ownedCardSelect });
  if (!owned) throw new UserFacingError('gifts.cardNotFound', 404);

  const [me, sent, pending, friendships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { level: true } }),
    sentToday(prisma, userId),
    inPendingChallenge(prisma, userId, owned.id),
    prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] },
      select: {
        userId: true,
        user: { select: { id: true, username: true, image: true } },
        friend: { select: { id: true, username: true, image: true } },
      },
    }),
  ]);

  const friends = friendships
    .map(f => (f.userId === userId ? f.friend : f.user))
    .filter(f => !!f.username);
  const ids = friends.map(f => f.id);
  const [owners, received] = await Promise.all([
    prisma.userCard.findMany({ where: { cardId, userId: { in: ids } }, select: { userId: true } }),
    prisma.cardGift.groupBy({ by: ['receiverId'], where: { receiverId: { in: ids }, createdAt: { gte: startOfUtcDay(new Date()) } }, _count: true }),
  ]);
  const ownerSet = new Set(owners.map(o => o.userId));
  const fullSet = new Set(received.filter(r => r._count >= GIFT_DAILY_RECEIVE_LIMIT).map(r => r.receiverId));

  const block: GiftBlock | null = giftBlock(
    { edition: owned.edition, inActiveTeam: owned.inActiveTeam, inPendingChallenge: pending },
    { level: me?.level ?? 1, sentToday: sent },
  );

  return {
    card: {
      id: owned.cardId,
      name: owned.card.name,
      rarity: owned.card.rarity,
      avatarUrl: owned.card.avatarUrl,
      isShiny: owned.isShiny,
      trainingLevel: owned.trainingLevel,
      loyaltyCount: owned.loyaltyCount,
    },
    fee: giftFee(owned.card.rarity),
    block,
    sentToday: sent,
    dailyLimit: GIFT_DAILY_SEND_LIMIT,
    friends: friends
      .map(f => ({ id: f.id, username: f.username!, image: f.image, ownsCard: ownerSet.has(f.id), full: fullSet.has(f.id) }))
      .sort((a, b) => a.username.localeCompare(b.username)),
  };
}

/** Gives one of the sender's cards to a friend, paying the fee. Throws UserFacingError when it can't. */
export async function sendGift(senderId: string, cardId: string, receiverUsername: string) {
  const receiver = await prisma.user.findFirst({
    where: { username: { equals: receiverUsername, mode: 'insensitive' } },
    select: { id: true, username: true },
  });
  if (!receiver) throw new UserFacingError('gifts.friendNotFound', 404);
  if (receiver.id === senderId) throw new UserFacingError('gifts.self');
  if (!(await areFriends(senderId, receiver.id))) throw new UserFacingError('gifts.notFriends', 403);

  return prisma.$transaction(async (tx) => {
    // Both locks, always in the same order: two friends gifting each other at once can't deadlock
    await lockPlayers(tx, [senderId, receiver.id]);

    const owned = await tx.userCard.findUnique({ where: { userId_cardId: { userId: senderId, cardId } }, select: ownedCardSelect });
    if (!owned) throw new UserFacingError('gifts.cardNotFound', 404);
    const sender = await tx.user.findUnique({ where: { id: senderId }, select: { level: true, username: true, name: true } });

    const block = giftBlock(
      { edition: owned.edition, inActiveTeam: owned.inActiveTeam, inPendingChallenge: await inPendingChallenge(tx, senderId, owned.id) },
      { level: sender?.level ?? 1, sentToday: await sentToday(tx, senderId) },
    );
    if (block) throw new UserFacingError(`gifts.${block}`, 400, { min: GIFT_MIN_LEVEL, limit: GIFT_DAILY_SEND_LIMIT });

    if (await receivedToday(tx, receiver.id) >= GIFT_DAILY_RECEIVE_LIMIT) {
      throw new UserFacingError('gifts.dailyReceiveLimit', 400, { name: receiver.username ?? '', limit: GIFT_DAILY_RECEIVE_LIMIT });
    }
    const alreadyOwned = await tx.userCard.findUnique({ where: { userId_cardId: { userId: receiver.id, cardId } }, select: { id: true } });
    if (alreadyOwned) throw new UserFacingError('gifts.alreadyOwned', 400, { name: receiver.username ?? '', card: owned.card.name });

    const fee = giftFee(owned.card.rarity);
    const balance = await spendBits(senderId, fee, 'card_gift', { tx, detail: `${owned.card.name} → ${receiver.username}` });
    if (balance === null) throw new UserFacingError('common.notEnoughBits');

    const created = await moveCard(tx, owned, receiver.id);
    await tx.cardGift.create({ data: { senderId, receiverId: receiver.id, cardId, isShiny: owned.isShiny, fee } });

    const from = sender?.username ?? sender?.name ?? 'A friend';
    await pushNotification(tx, receiver.id, 'card_gift', `${from} gave you ${owned.isShiny ? 'a Shiny ' : ''}${owned.card.name} (${owned.card.rarity})! It's in your collection.`, '/collection');

    return { fee, balance, receiver: receiver.username, card: owned.card.name, receiverUserCardId: created.id };
  }, { maxWait: 10_000, timeout: 15_000 });
}
