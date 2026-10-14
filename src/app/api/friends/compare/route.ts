import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/apiResponse';

const RARITY_RANK: Record<string, number> = { Legendary: 0, Epic: 1, Rare: 2, Uncommon: 3, Common: 4 };
const LIST_LIMIT = 120;

/**
 * Collection comparison with a friend: the cards they have that you don't,
 * and the other way round (accepted friends only). Prepares gifts and trades.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);

  const username = new URL(req.url).searchParams.get('username');
  if (!username) return apiError('friends.usernameRequired');
  const friend = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true, username: true },
  });
  if (!friend) return apiError('friends.playerNotFound', 404);

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [{ userId, friendId: friend.id }, { userId: friend.id, friendId: userId }],
    },
    select: { id: true },
  });
  if (!friendship) return apiError('friends.compareFriendsOnly', 403);

  const cardSelect = { id: true, githubUsername: true, name: true, rarity: true, avatarUrl: true, primaryLanguage: true } as const;
  const [mine, theirs] = await Promise.all([
    prisma.userCard.findMany({ where: { userId }, select: { card: { select: cardSelect } } }),
    prisma.userCard.findMany({ where: { userId: friend.id }, select: { card: { select: cardSelect } } }),
  ]);
  const mineIds = new Set(mine.map(uc => uc.card.id));
  const theirIds = new Set(theirs.map(uc => uc.card.id));
  const sortList = <T extends { rarity: string; name: string }>(list: T[]) =>
    list.sort((a, b) => (RARITY_RANK[a.rarity] ?? 9) - (RARITY_RANK[b.rarity] ?? 9) || a.name.localeCompare(b.name));

  const onlyTheirs = sortList(theirs.map(uc => uc.card).filter(c => !mineIds.has(c.id)));
  const onlyMine = sortList(mine.map(uc => uc.card).filter(c => !theirIds.has(c.id)));
  return NextResponse.json({
    friend: friend.username,
    shared: mine.filter(uc => theirIds.has(uc.card.id)).length,
    onlyTheirs: { total: onlyTheirs.length, cards: onlyTheirs.slice(0, LIST_LIMIT) },
    onlyMine: { total: onlyMine.length, cards: onlyMine.slice(0, LIST_LIMIT) },
  });
}
