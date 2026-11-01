import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { lockUser, UserFacingError, withUserLock, type Tx } from './userLock';
import { pushNotification } from './notifications';
import {
  LEAGUE_GROUP_CODE_ALPHABET,
  LEAGUE_GROUP_CODE_LENGTH,
  LEAGUE_GROUP_MAX_MEMBERS,
  LEAGUE_GROUP_MAX_OWNED,
  LEAGUE_GROUP_MAX_PER_PLAYER,
  cleanGroupName,
  currentAndNextRound,
  formatGroupCode,
  groupOwnerOf,
  normalizeGroupCode,
  roundIdOf,
} from './league';

/**
 * Private Dev Leagues: a name, an invite code and its members. They rank the
 * lineups everyone already plays (leagueService.ts), so they hold no lineups,
 * points or BITS of their own. Rules and limits in league.ts.
 *
 * Lock order: the joining player, then the league row. Nothing takes a player
 * lock while holding a league row (notifications go out after the commit).
 */

function newCode(): string {
  return Array.from({ length: LEAGUE_GROUP_CODE_LENGTH }, () => LEAGUE_GROUP_CODE_ALPHABET[randomInt(LEAGUE_GROUP_CODE_ALPHABET.length)]).join('');
}

const isCodeClash = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Retries `fn` with a fresh code when it clashes with an existing one (31^8 codes: practically never). */
async function withFreshCode<T>(fn: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(newCode());
    } catch (err) {
      if (!isCodeClash(err) || attempt >= 4) throw err;
    }
  }
}

/** Locks a league row and reads its members. */
async function lockGroup(tx: Tx, groupId: string) {
  const [row] = await tx.$queryRaw<{ id: string; name: string; ownerId: string | null }[]>`
    SELECT "id", "name", "ownerId" FROM "LeagueGroup" WHERE "id" = ${groupId} FOR UPDATE`;
  if (!row) return null;
  const members = await tx.leagueGroupMember.findMany({ where: { groupId }, select: { userId: true, joinedAt: true } });
  return { ...row, members };
}

/** Sent after the commit, each under its player's lock (the list is a JSON column). */
async function notify(userId: string | null, message: string) {
  if (!userId) return;
  try {
    await withUserLock(userId, tx => pushNotification(tx, userId, 'league_group', message, '/league?tab=groups'));
  } catch (err) {
    console.error('[League] group notification failed:', err);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function createGroup(userId: string, rawName: string) {
  const name = cleanGroupName(rawName);
  const firstRoundId = roundIdOf(currentAndNextRound(new Date()).current);
  return withFreshCode(code => withUserLock(userId, async (tx) => {
    const [joined, owned] = await Promise.all([
      tx.leagueGroupMember.count({ where: { userId } }),
      tx.leagueGroup.count({ where: { ownerId: userId } }),
    ]);
    if (joined >= LEAGUE_GROUP_MAX_PER_PLAYER) throw new UserFacingError('leagueGroups.tooManyGroups', 409, { max: LEAGUE_GROUP_MAX_PER_PLAYER });
    if (owned >= LEAGUE_GROUP_MAX_OWNED) throw new UserFacingError('leagueGroups.tooManyOwned', 409, { max: LEAGUE_GROUP_MAX_OWNED });
    const group = await tx.leagueGroup.create({
      data: { name, code, ownerId: userId, firstRoundId, members: { create: { userId } } },
      select: { id: true, code: true },
    });
    return { id: group.id, code: formatGroupCode(group.code) };
  }));
}

/** What a code leads to, before joining: name, size, who runs it. */
export async function previewGroup(userId: string, rawCode: string) {
  const code = normalizeGroupCode(rawCode);
  if (!code) throw new UserFacingError('leagueGroups.badCode', 400, { length: LEAGUE_GROUP_CODE_LENGTH });
  const group = await prisma.leagueGroup.findUnique({
    where: { code },
    select: { id: true, name: true, ownerId: true, members: { select: { userId: true, joinedAt: true } } },
  });
  if (!group) throw new UserFacingError('leagueGroups.notFound', 404);
  const ownerId = groupOwnerOf(group.ownerId, group.members);
  const owner = ownerId ? await prisma.user.findUnique({ where: { id: ownerId }, select: { username: true } }) : null;
  return {
    id: group.id,
    name: group.name,
    code: formatGroupCode(code),
    members: group.members.length,
    full: group.members.length >= LEAGUE_GROUP_MAX_MEMBERS,
    owner: owner?.username ?? null,
    joined: group.members.some(m => m.userId === userId),
  };
}

export async function joinGroup(userId: string, rawCode: string) {
  const code = normalizeGroupCode(rawCode);
  if (!code) throw new UserFacingError('leagueGroups.badCode', 400, { length: LEAGUE_GROUP_CODE_LENGTH });
  const joined = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const found = await tx.leagueGroup.findUnique({ where: { code }, select: { id: true } });
    if (!found) throw new UserFacingError('leagueGroups.notFound', 404);
    const group = await lockGroup(tx, found.id);
    if (!group) throw new UserFacingError('leagueGroups.notFound', 404);
    if (group.members.some(m => m.userId === userId)) throw new UserFacingError('leagueGroups.alreadyMember', 409);
    if (group.members.length >= LEAGUE_GROUP_MAX_MEMBERS) throw new UserFacingError('leagueGroups.full', 409, { max: LEAGUE_GROUP_MAX_MEMBERS });
    const mine = await tx.leagueGroupMember.count({ where: { userId } });
    if (mine >= LEAGUE_GROUP_MAX_PER_PLAYER) throw new UserFacingError('leagueGroups.tooManyGroups', 409, { max: LEAGUE_GROUP_MAX_PER_PLAYER });
    await tx.leagueGroupMember.create({ data: { groupId: group.id, userId } });
    return { id: group.id, name: group.name, ownerId: groupOwnerOf(group.ownerId, group.members) };
  }, { maxWait: 10_000, timeout: 15_000 });

  const player = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  await notify(joined.ownerId, `${player?.username ?? 'Someone'} joined your Dev League "${joined.name}".`);
  return { id: joined.id, name: joined.name };
}

/** Leaves a league. The last one out deletes it; an owner who leaves hands it to the earliest member. */
export async function leaveGroup(userId: string, groupId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await lockGroup(tx, groupId);
    if (!group || !group.members.some(m => m.userId === userId)) throw new UserFacingError('leagueGroups.notMember', 404);
    const owner = groupOwnerOf(group.ownerId, group.members);
    const rest = group.members.filter(m => m.userId !== userId);
    await tx.leagueGroupMember.delete({ where: { groupId_userId: { groupId, userId } } });
    if (rest.length === 0) {
      await tx.leagueGroup.delete({ where: { id: groupId } });
      return { deleted: true };
    }
    if (owner === userId) await tx.leagueGroup.update({ where: { id: groupId }, data: { ownerId: groupOwnerOf(null, rest) } });
    return { deleted: false };
  }, { maxWait: 10_000, timeout: 15_000 });
}

/** The owner removes a member (they can come back with the code, unless the owner changes it). */
export async function removeMember(userId: string, groupId: string, memberId: string) {
  const name = await prisma.$transaction(async (tx) => {
    const group = await lockGroup(tx, groupId);
    if (!group || !group.members.some(m => m.userId === userId)) throw new UserFacingError('leagueGroups.notMember', 404);
    if (groupOwnerOf(group.ownerId, group.members) !== userId) throw new UserFacingError('leagueGroups.ownerOnly', 403);
    if (memberId === userId) throw new UserFacingError('leagueGroups.removeSelf', 400);
    if (!group.members.some(m => m.userId === memberId)) throw new UserFacingError('leagueGroups.notMember', 404);
    await tx.leagueGroupMember.delete({ where: { groupId_userId: { groupId, userId: memberId } } });
    return group.name;
  }, { maxWait: 10_000, timeout: 15_000 });
  await notify(memberId, `You were removed from the Dev League "${name}".`);
  return { removed: memberId };
}

/** The owner swaps the invite code: the old one stops working. */
export async function resetGroupCode(userId: string, groupId: string) {
  return withFreshCode(code => prisma.$transaction(async (tx) => {
    const group = await lockGroup(tx, groupId);
    if (!group || !group.members.some(m => m.userId === userId)) throw new UserFacingError('leagueGroups.notMember', 404);
    if (groupOwnerOf(group.ownerId, group.members) !== userId) throw new UserFacingError('leagueGroups.ownerOnly', 403);
    await tx.leagueGroup.update({ where: { id: groupId }, data: { code } });
    return { code: formatGroupCode(code) };
  }, { maxWait: 10_000, timeout: 15_000 }));
}

// ─── Reading ────────────────────────────────────────────────────────────────

/**
 * The player's private leagues with every member's points: the running round
 * (partial) and the closed rounds since each league's first round. Ranked on
 * the page (rankGroup), which switches between the two.
 */
export async function listGroups(userId: string, now = new Date()) {
  const runningId = roundIdOf(currentAndNextRound(now).current);
  const groups = await prisma.leagueGroup.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, code: true, ownerId: true, firstRoundId: true,
      members: { select: { userId: true, joinedAt: true, user: { select: { username: true, image: true } } } },
    },
  });
  const allIds = [...new Set(groups.flatMap(g => g.members.map(m => m.userId)))];

  const [running, ...totals] = await Promise.all([
    prisma.leagueLineup.findMany({ where: { roundId: runningId, userId: { in: allIds } }, select: { userId: true, points: true } }),
    ...groups.map(g => prisma.leagueLineup.groupBy({
      by: ['userId'],
      where: { userId: { in: g.members.map(m => m.userId) }, roundId: { gte: g.firstRoundId }, round: { closedAt: { not: null } } },
      _sum: { points: true },
      _count: { _all: true },
    })),
  ]);
  const roundPoints = new Map(running.map(r => [r.userId, r.points]));

  return {
    groups: groups.map((g, i) => {
      const owner = groupOwnerOf(g.ownerId, g.members);
      const total = new Map(totals[i].map(t => [t.userId, t]));
      return {
        id: g.id,
        name: g.name,
        code: formatGroupCode(g.code),
        firstRoundId: g.firstRoundId,
        isOwner: owner === userId,
        members: g.members
          .map(m => ({
            userId: m.userId,
            username: m.user.username,
            image: m.user.image,
            owner: m.userId === owner,
            you: m.userId === userId,
            round: roundPoints.get(m.userId) ?? null,
            overall: total.get(m.userId)?._sum.points ?? 0,
            rounds: total.get(m.userId)?._count._all ?? 0,
          }))
          .sort((a, b) => (a.username ?? '').localeCompare(b.username ?? '')),
      };
    }),
    limits: { members: LEAGUE_GROUP_MAX_MEMBERS, perPlayer: LEAGUE_GROUP_MAX_PER_PLAYER, owned: LEAGUE_GROUP_MAX_OWNED },
  };
}
