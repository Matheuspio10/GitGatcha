import { prisma } from './prisma';
import { ACHIEVEMENTS } from './achievementUtils';
import { sprintThemeById } from './sprints';
import { TOWER_TOP_FLOOR, themeForWeek } from './tower';
import {
  FEED_LIMIT, FEED_PULL_RARITIES, FEED_SHINY_RARITIES, FEED_SPRINT_MAX_POSITION, FEED_WINDOW_DAYS,
  isFeedPull, mergeFeed, type FeedEvent, type FeedUser,
} from './activityFeed';

/** Ids of the player's accepted friends (friendships are stored in one direction). */
export async function friendIdsOf(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ userId }, { friendId: userId }] },
    select: { userId: true, friendId: true },
  });
  return [...new Set(rows.map(r => (r.userId === userId ? r.friendId : r.userId)))];
}

/** What the player's friends did in the last FEED_WINDOW_DAYS, newest first (see activityFeed.ts). */
export async function getFriendsFeed(userId: string, now = new Date()): Promise<FeedEvent[]> {
  const ids = await friendIdsOf(userId);
  if (ids.length === 0) return [];
  const since = new Date(now.getTime() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const take = FEED_LIMIT;

  const [pulls, achievements, sprints, towers, users, gifts] = await Promise.all([
    prisma.userCard.findMany({
      where: {
        userId: { in: ids },
        createdAt: { gte: since },
        edition: 'standard', // the Signature card is a gift for connecting GitHub, not a pull
        OR: [
          { card: { rarity: { in: [...FEED_PULL_RARITIES] } } },
          { isShiny: true, card: { rarity: { in: [...FEED_SHINY_RARITIES] } } },
        ],
      },
      select: { id: true, userId: true, cardId: true, createdAt: true, isShiny: true, card: { select: { githubUsername: true, name: true, rarity: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.userAchievement.findMany({
      where: { userId: { in: ids }, unlockedAt: { gte: since } },
      select: { userId: true, achievementId: true, tier: true, unlockedAt: true },
      orderBy: { unlockedAt: 'desc' },
      take,
    }),
    prisma.sprintResult.findMany({
      where: { userId: { in: ids }, position: { lte: FEED_SPRINT_MAX_POSITION }, createdAt: { gte: since } },
      select: { userId: true, sprintId: true, position: true, createdAt: true, sprint: { select: { kind: true, theme: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    prisma.towerRun.findMany({
      where: { userId: { in: ids }, cleared: { gte: TOWER_TOP_FLOOR }, updatedAt: { gte: since } },
      select: { id: true, userId: true, weekStart: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take,
    }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, image: true } }),
    // A card a friend received as a gift is not a pull
    prisma.cardGift.findMany({ where: { receiverId: { in: ids }, createdAt: { gte: since } }, select: { receiverId: true, cardId: true } }),
  ]);
  const gifted = new Set(gifts.map(g => `${g.receiverId}:${g.cardId}`));

  const people = new Map<string, FeedUser>();
  for (const u of users) if (u.username) people.set(u.id, { username: u.username, image: u.image });
  const achievementNames = new Map(ACHIEVEMENTS.map(a => [a.id, a.name]));

  const events: FeedEvent[][] = [
    pulls.filter(p => isFeedPull(p.card.rarity, p.isShiny) && !gifted.has(`${p.userId}:${p.cardId}`)).flatMap(p => {
      const user = people.get(p.userId);
      return user ? [{
        id: `pull:${p.id}`, type: 'pull' as const, at: p.createdAt.toISOString(), user,
        login: p.card.githubUsername, name: p.card.name, rarity: p.card.rarity, shiny: p.isShiny, avatarUrl: p.card.avatarUrl,
      }] : [];
    }),
    achievements.flatMap(a => {
      const user = people.get(a.userId);
      const name = achievementNames.get(a.achievementId);
      return user && name ? [{
        id: `achievement:${a.userId}:${a.achievementId}:${a.tier}`, type: 'achievement' as const, at: a.unlockedAt.toISOString(), user,
        achievementId: a.achievementId, achievementName: name, tier: a.tier,
      }] : [];
    }),
    sprints.flatMap(s => {
      const user = people.get(s.userId);
      const theme = sprintThemeById(s.sprint.theme);
      return user ? [{
        id: `sprint:${s.sprintId}:${s.userId}`, type: 'sprint' as const, at: s.createdAt.toISOString(), user,
        kind: s.sprint.kind, themeId: theme.id, themeName: theme.name, position: s.position,
      }] : [];
    }),
    towers.flatMap(t => {
      const user = people.get(t.userId);
      return user ? [{ id: `tower:${t.id}`, type: 'tower' as const, at: t.updatedAt.toISOString(), user, theme: themeForWeek(t.weekStart) }] : [];
    }),
  ];
  return mergeFeed(events);
}
