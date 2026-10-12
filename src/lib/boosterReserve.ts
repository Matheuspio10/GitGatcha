/**
 * Consumable reserve of pre-drawn developers (BoosterReserve table).
 *
 * Rows are filled by the same uniform sampler as live draws, without any
 * player-specific exclusion, so each row is an independent uniform draw. A row
 * is handed out at most once (oldest first) and then deleted — which keeps
 * reserve cards exactly as random as live ones, while making boosters instant
 * and independent of GitHub's search quota at opening time.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { DevStats } from './githubService';
import type { DevSampler, PoolFilter } from './devSampler';
import type { Rarity } from './rarity';
import { STAT_VERSION } from './cardStats';

/** Reserve rows older than this are discarded (stats would be stale). */
const RESERVE_MAX_AGE_DAYS = 7;

/** How many pre-drawn developers to keep per (booster, rarity slot). */
export function reserveTarget(rarity: Rarity): number {
  return rarity === 'Common' ? 8 : 4;
}

/** Atomically takes the oldest reserved dev for this slot that the player shouldn't skip. */
export async function takeFromReserve(packId: string, rarity: Rarity, exclude: Set<string>): Promise<DevStats | null> {
  const excluded = [...exclude];
  const rows = await prisma.$queryRaw<{ stats: Prisma.JsonValue }[]>`
    DELETE FROM "BoosterReserve" WHERE id = (
      SELECT id FROM "BoosterReserve"
      WHERE "packId" = ${packId} AND "rarity" = ${rarity}
        AND "createdAt" > NOW() - make_interval(days => ${RESERVE_MAX_AGE_DAYS}::int)
        AND "stats"->>'statVersion' = ${STAT_VERSION}
        AND NOT (lower("githubUsername") = ANY(${excluded}::text[]))
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "stats"`;
  return rows.length ? (rows[0].stats as unknown as DevStats) : null;
}

export async function reserveDeficit(packId: string, rarity: Rarity): Promise<number> {
  const have = await prisma.boosterReserve.count({
    where: {
      packId,
      rarity,
      createdAt: { gt: new Date(Date.now() - RESERVE_MAX_AGE_DAYS * 86_400_000) },
      stats: { path: ['statVersion'], equals: STAT_VERSION },
    },
  });
  return Math.max(0, reserveTarget(rarity) - have);
}

/** Draws up to `count` developers into the reserve; stops early at `deadline` or when GitHub can't answer. */
export async function refillReserve(
  sampler: DevSampler, packId: string, pool: PoolFilter, rarity: Rarity, count: number, deadline: number,
): Promise<number> {
  let added = 0;
  for (let i = 0; i < count && Date.now() < deadline; i++) {
    const dev = await sampler.drawDev(pool, rarity); // no exclusion: every row must be an independent draw
    if (!dev) break;
    await prisma.boosterReserve.create({
      data: { packId, rarity, githubUsername: dev.githubUsername, stats: { ...dev, statVersion: STAT_VERSION } as unknown as Prisma.InputJsonValue },
    });
    added++;
  }
  return added;
}

/** Drops rows that are too old or were drawn with another stat formula version. */
export async function purgeStaleReserve(): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "BoosterReserve"
    WHERE "createdAt" < NOW() - make_interval(days => ${RESERVE_MAX_AGE_DAYS}::int)
       OR "stats"->>'statVersion' IS DISTINCT FROM ${STAT_VERSION}`;
}
