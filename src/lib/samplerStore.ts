import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  fetchGitHubUserStats,
  getAccountById,
  getFirstAccountAfter,
  GitHubAuthError,
  GitHubUnavailableError,
  graphql,
  searchUsers,
} from './githubService';
import { DevSampler, OrgMember, SamplerCache } from './devSampler';

// ─── Cache: per-instance memory in front of the GithubCache table ───────

const memory = new Map<string, { value: unknown; expiresAt: number }>();
const MEMORY_MAX = 20_000;

export const dbCache: SamplerCache & { delete(key: string): Promise<void> } = {
  async get<T>(key: string): Promise<T | undefined> {
    const hit = memory.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;

    const row = await prisma.githubCache.findUnique({ where: { key } });
    if (!row || row.expiresAt.getTime() <= Date.now()) return undefined;
    memory.set(key, { value: row.value, expiresAt: row.expiresAt.getTime() });
    return row.value as T;
  },

  async set(key: string, value: unknown, ttlSeconds: number) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    if (memory.size >= MEMORY_MAX) memory.clear();
    memory.set(key, { value, expiresAt: expiresAt.getTime() });
    await prisma.githubCache.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, expiresAt },
      update: { value: value as Prisma.InputJsonValue, expiresAt },
    });
  },

  async delete(key: string) {
    memory.delete(key);
    await prisma.githubCache.deleteMany({ where: { key } });
  },
};

// ─── Org member pools (Big Tech) ────────────────────────────────────────

const ORG_POOL_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const ORG_MEMBERS_QUERY = `
  query($org: String!, $after: String) {
    organization(login: $org) {
      membersWithRole(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { login followers { totalCount } }
      }
    }
  }`;

interface OrgMembersResponse {
  organization: {
    membersWithRole: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: { login: string; followers: { totalCount: number } }[];
    };
  } | null;
}

interface OrgRefreshState {
  after: string | null;
  startedAt: number;
}

const orgRefreshKey = (org: string) => `orgRefresh:${org}`;

/**
 * Refreshes the stored public-member list of `org` (GraphQL: 100 members with
 * follower counts per call). Big orgs (Microsoft: ~4k members) don't fit in one
 * serverless invocation, so every page is saved as it arrives and the cursor is
 * checkpointed: a call that runs out of time resumes where the last one stopped.
 */
export async function refreshOrgMembers(org: string, deadline = Infinity): Promise<{ done: boolean; saved: number }> {
  const state = (await dbCache.get<OrgRefreshState>(orgRefreshKey(org))) ?? { after: null, startedAt: Date.now() };
  let after = state.after;
  let saved = 0;

  do {
    if (Date.now() > deadline) return { done: false, saved };
    const data: OrgMembersResponse = await graphql(ORG_MEMBERS_QUERY, { org, after });
    const conn = data.organization?.membersWithRole;
    if (!conn) break;

    const logins = conn.nodes.map(n => n.login);
    const followers = conn.nodes.map(n => n.followers.totalCount);
    if (logins.length) {
      await prisma.$executeRaw`
        INSERT INTO "OrgMember" ("org", "login", "followers", "updatedAt")
        SELECT ${org}, t.login, t.followers, NOW()
        FROM unnest(${logins}::text[], ${followers}::int[]) AS t(login, followers)
        ON CONFLICT ("org", "login") DO UPDATE SET "followers" = EXCLUDED."followers", "updatedAt" = NOW()`;
    }
    saved += logins.length;

    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    await dbCache.set(orgRefreshKey(org), { after, startedAt: state.startedAt }, ORG_POOL_MAX_AGE_MS / 1000);
  } while (after);

  // Members not seen during this refresh left the org (or hid their membership)
  await prisma.orgMember.deleteMany({ where: { org, updatedAt: { lt: new Date(state.startedAt) } } });
  await dbCache.delete(orgRefreshKey(org));
  return { done: true, saved };
}

export async function isOrgPoolStale(org: string): Promise<boolean> {
  if (await dbCache.get<OrgRefreshState>(orgRefreshKey(org))) return true; // refresh in progress
  const newest = await prisma.orgMember.findFirst({ where: { org }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
  return !newest || Date.now() - newest.updatedAt.getTime() > ORG_POOL_MAX_AGE_MS;
}

/** Time a booster may spend loading org pools that the cron hasn't built yet. */
const INLINE_ORG_LOAD_MS = 8_000;

async function orgMembers(orgs: string[]): Promise<OrgMember[]> {
  // An empty pool would make the booster unusable: start building it here (bounded in time;
  // progress is kept and the cron finishes it).
  const deadline = Date.now() + INLINE_ORG_LOAD_MS;
  for (const org of orgs) {
    if (Date.now() > deadline) break;
    if (await prisma.orgMember.count({ where: { org } }) === 0) {
      try {
        await refreshOrgMembers(org, deadline);
      } catch (err) {
        console.error(`[Sampler] Could not load members of ${org}:`, (err as Error).message);
      }
    }
  }
  return prisma.orgMember.findMany({ where: { org: { in: orgs } }, select: { login: true, followers: true } });
}

// ─── Wiring ─────────────────────────────────────────────────────────────

// Player tokens GitHub rejected (revoked/expired) in this instance
const deadTokens = new Set<string>();

/** Runs on the player's token when there is one, falling back to the server token if GitHub refuses it. */
async function onToken<R>(token: string | undefined, run: (token?: string) => Promise<R>): Promise<R> {
  if (token && !deadTokens.has(token)) {
    try {
      return await run(token);
    } catch (err) {
      if (err instanceof GitHubAuthError) deadTokens.add(token);
      else if (!(err instanceof GitHubUnavailableError)) throw err;
    }
  }
  return run(undefined);
}

function buildSampler(token?: string) {
  return new DevSampler({
    search: (q, page, perPage, order) => onToken(token, t => searchUsers(q, page, perPage, order, t)),
    accountById: id => onToken(token, t => getAccountById(id, t)),
    firstAccountAfter: id => onToken(token, t => getFirstAccountAfter(id, t)),
    fetchStats: login => onToken(token, t => fetchGitHubUserStats(login, t)),
    orgMembers,
    cache: dbCache, // shared: counts and the signup curve don't depend on whose token fetched them
    randomInt: (n: number) => randomInt(0, n),
    now: () => Date.now(),
  });
}

/** Sampler on the server's GitHub token. */
export const devSampler = buildSampler();

const playerSamplers = new Map<string, DevSampler>();

/** Sampler that spends the player's own GitHub quota (if they connected GitHub), else the server's. */
export function samplerForToken(token?: string | null): DevSampler {
  if (!token) return devSampler;
  let sampler = playerSamplers.get(token);
  if (!sampler) {
    if (playerSamplers.size > 500) playerSamplers.clear();
    sampler = buildSampler(token);
    playerSamplers.set(token, sampler);
  }
  return sampler;
}

/** OAuth token of the player's connected GitHub account, if any. Never sent to the client. */
export async function getPlayerGithubToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'github', access_token: { not: null } },
    select: { access_token: true },
  });
  return account?.access_token ?? null;
}

// ─── Recently pulled developers (per player and booster type) ───────────

const RECENT_PULL_TTL_MS = 6 * 3600 * 1000;

export async function getRecentPulls(userId: string, packId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - RECENT_PULL_TTL_MS);
  const rows = await prisma.recentPull.findMany({
    where: { userId, packId, createdAt: { gte: since } },
    select: { githubUsername: true },
  });
  return new Set(rows.map(r => r.githubUsername.toLowerCase()));
}

export async function recordPulls(userId: string, packId: string, logins: string[]) {
  if (logins.length === 0) return;
  await prisma.recentPull.createMany({ data: logins.map(githubUsername => ({ userId, packId, githubUsername })) });
  await prisma.recentPull.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RECENT_PULL_TTL_MS) } } });
}
