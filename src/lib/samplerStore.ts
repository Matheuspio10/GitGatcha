import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  fetchGitHubUserStats,
  getAccountById,
  getFirstAccountAfter,
  graphql,
  searchUsers,
} from './githubService';
import { DevSampler, OrgMember, SamplerCache } from './devSampler';

// ─── Cache: per-instance memory in front of the GithubCache table ───────

const memory = new Map<string, { value: unknown; expiresAt: number }>();
const MEMORY_MAX = 20_000;

export const dbCache: SamplerCache = {
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

/** Replaces the stored public-member list of `org` (GraphQL: 100 members with follower counts per call). */
export async function refreshOrgMembers(org: string): Promise<number> {
  const members: OrgMember[] = [];
  let after: string | null = null;
  do {
    const data: OrgMembersResponse = await graphql(ORG_MEMBERS_QUERY, { org, after });
    const conn = data.organization?.membersWithRole;
    if (!conn) break;
    for (const n of conn.nodes) members.push({ login: n.login, followers: n.followers.totalCount });
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);

  await prisma.$transaction([
    prisma.orgMember.deleteMany({ where: { org } }),
    prisma.orgMember.createMany({ data: members.map(m => ({ org, login: m.login, followers: m.followers })) }),
  ]);
  return members.length;
}

export async function isOrgPoolStale(org: string): Promise<boolean> {
  const newest = await prisma.orgMember.findFirst({ where: { org }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
  return !newest || Date.now() - newest.updatedAt.getTime() > ORG_POOL_MAX_AGE_MS;
}

async function orgMembers(orgs: string[]): Promise<OrgMember[]> {
  // An empty pool would make the booster unusable: build it on first use (the cron keeps it fresh).
  for (const org of orgs) {
    if (await prisma.orgMember.count({ where: { org } }) === 0) {
      try {
        await refreshOrgMembers(org);
      } catch (err) {
        console.error(`[Sampler] Could not load members of ${org}:`, (err as Error).message);
      }
    }
  }
  return prisma.orgMember.findMany({ where: { org: { in: orgs } }, select: { login: true, followers: true } });
}

// ─── Wiring ─────────────────────────────────────────────────────────────

export const devSampler = new DevSampler({
  search: searchUsers,
  accountById: getAccountById,
  firstAccountAfter: getFirstAccountAfter,
  fetchStats: fetchGitHubUserStats,
  orgMembers,
  cache: dbCache,
  randomInt: (n: number) => randomInt(0, n),
  now: () => Date.now(),
});

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
