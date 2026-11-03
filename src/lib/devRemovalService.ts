/**
 * Developers who left the game (/remove-my-card). A developer proves who they
 * are by signing in with that GitHub account; removing then:
 *  - lists them in DevRemoval (login and GitHub id), so packs, the forge, the
 *    wishlist and the Signature card skip them from then on;
 *  - anonymizes their card (devRemoval.ts): players keep it with the same
 *    stats, without the name, photo, login and GitHub numbers;
 *  - drops them from the booster reserve and pools, recent pulls and wishlists;
 *  - replaces their name and photo in stored battles (replays are public).
 * Server only.
 */
import { prisma } from './prisma';
import { getTokenOwner } from './githubService';
import { anonymizedCardData, githubIdFromAvatar, scrubBattle, type RemovedDevs } from './devRemoval';
import { UserFacingError, asJson } from './userLock';

/** Every developer who left (a handful of rows), for the draws. */
export async function loadRemovedDevs(): Promise<RemovedDevs> {
  const rows = await prisma.devRemoval.findMany({ select: { githubLogin: true, githubId: true } });
  return {
    logins: new Set(rows.map(r => r.githubLogin)),
    ids: new Set(rows.flatMap(r => (r.githubId === null ? [] : [r.githubId]))),
  };
}

/** True when this GitHub login (or the account behind this avatar) left the game. */
export async function isDevRemoved(login: string, avatarUrl?: string | null): Promise<boolean> {
  const id = githubIdFromAvatar(avatarUrl);
  const row = await prisma.devRemoval.findFirst({
    where: { OR: [{ githubLogin: login.toLowerCase() }, ...(id !== null ? [{ githubId: id }] : [])] },
    select: { id: true },
  });
  return !!row;
}

/** The card of a GitHub account: by login, or by the id in its avatar after a rename. */
async function findDevCard(login: string, id: number) {
  return prisma.card.findFirst({
    where: {
      removedAt: null,
      OR: [
        { githubUsername: { equals: login, mode: 'insensitive' } },
        { avatarUrl: { startsWith: `https://avatars.githubusercontent.com/u/${id}?` } },
      ],
    },
    select: { id: true, name: true, avatarUrl: true, flavorText: true, rarity: true, primaryLanguage: true, atk: true, def: true, hp: true },
  });
}

/** The GitHub account the player signed in with, checked with GitHub. */
async function verifiedGithubOwner(userId: string) {
  const account = await prisma.account.findFirst({ where: { userId, provider: 'github' }, select: { access_token: true } });
  if (!account?.access_token) return null;
  return getTokenOwner(account.access_token);
}

export type DevRemovalStatus =
  | { state: 'noGithub' }
  | { state: 'removed'; login: string; removedAt: string }
  | { state: 'ready'; login: string; card: Awaited<ReturnType<typeof findDevCard>>; owners: number };

export async function devRemovalStatus(userId: string): Promise<DevRemovalStatus> {
  const owner = await verifiedGithubOwner(userId);
  if (!owner) return { state: 'noGithub' };
  const removal = await prisma.devRemoval.findFirst({
    where: { OR: [{ githubLogin: owner.login.toLowerCase() }, { githubId: owner.id }] },
    select: { createdAt: true },
  });
  if (removal) return { state: 'removed', login: owner.login, removedAt: removal.createdAt.toISOString() };
  const card = await findDevCard(owner.login, owner.id);
  const owners = card ? await prisma.userCard.count({ where: { cardId: card.id } }) : 0;
  return { state: 'ready', login: owner.login, card, owners };
}

/** Removes the GitHub account the player signed in with. Idempotent. */
export async function removeDevForUser(userId: string): Promise<{ login: string; battlesScrubbed: number }> {
  const owner = await verifiedGithubOwner(userId);
  if (!owner) throw new UserFacingError('devRemoval.githubRequired', 403);
  return removeDev(owner, userId);
}

/** Removes a GitHub account already proven to be the requester's (see removeDevForUser). Idempotent. */
export async function removeDev(owner: { login: string; id: number }, userId: string | null): Promise<{ login: string; battlesScrubbed: number }> {
  const login = owner.login.toLowerCase();
  const card = await findDevCard(owner.login, owner.id);

  await prisma.$transaction(async (tx) => {
    // Same account under its old login (renamed since): keep the first row
    const existing = await tx.devRemoval.findFirst({ where: { OR: [{ githubLogin: login }, { githubId: owner.id }] }, select: { id: true } });
    if (!existing) await tx.devRemoval.create({ data: { githubLogin: login, githubId: owner.id, userId } });
    if (card) {
      await tx.card.update({ where: { id: card.id }, data: { ...anonymizedCardData(card.id), removedAt: new Date() } });
    }
    await tx.$executeRaw`DELETE FROM "BoosterReserve" WHERE lower("githubUsername") = ${login}`;
    await tx.$executeRaw`DELETE FROM "BoosterFallbackDev" WHERE lower("githubUsername") = ${login}`;
    await tx.$executeRaw`DELETE FROM "RecentPull" WHERE lower("githubUsername") = ${login}`;
    await tx.$executeRaw`DELETE FROM "OrgMember" WHERE lower("login") = ${login}`;
    await tx.$executeRaw`
      UPDATE "User" SET "wishlist" = (
        SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements("wishlist") e
        WHERE lower(e->>'username') IS DISTINCT FROM ${login}
      )
      WHERE jsonb_typeof("wishlist") = 'array'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements("wishlist") e WHERE lower(e->>'username') = ${login})`;
  });

  const battlesScrubbed = card ? await scrubDevFromBattles({ name: card.name, avatarUrl: card.avatarUrl }) : 0;
  console.log(`[DevRemoval] ${login} left the game (card ${card?.id ?? 'none'}, ${battlesScrubbed} battles scrubbed)`);
  return { login, battlesScrubbed };
}

/** Replaces the developer's name and photo in every stored battle they appear in, in batches. */
async function scrubDevFromBattles(dev: { name: string; avatarUrl: string | null }): Promise<number> {
  const needle = `%${dev.avatarUrl ?? dev.name}%`;
  let scrubbed = 0;
  let afterId = '';
  for (;;) {
    const batch = await prisma.$queryRaw<{ id: string; challengerTeam: unknown; defenderTeam: unknown; battleStats: unknown; log: unknown }[]>`
      SELECT "id", "challengerTeam", "defenderTeam", "battleStats", "log" FROM "Battle"
      WHERE "id" > ${afterId}
        AND ("challengerTeam"::text LIKE ${needle} OR "defenderTeam"::text LIKE ${needle})
      ORDER BY "id" LIMIT 100`;
    if (batch.length === 0) return scrubbed;
    for (const b of batch) {
      const clean = scrubBattle(b, dev);
      if (!clean) continue;
      await prisma.battle.update({
        where: { id: b.id },
        // Columns left empty stay as they are
        data: {
          challengerTeam: asJson(clean.challengerTeam),
          defenderTeam: asJson(clean.defenderTeam),
          battleStats: clean.battleStats == null ? undefined : asJson(clean.battleStats),
          log: clean.log == null ? undefined : asJson(clean.log),
        },
      });
      scrubbed++;
    }
    afterId = batch[batch.length - 1].id;
  }
}
