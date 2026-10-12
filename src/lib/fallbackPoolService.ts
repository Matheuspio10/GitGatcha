import { prisma } from './prisma';
import { GitHubUnavailableError } from './githubService';
import { ALL_PACKS, BIG_TECH_ORGS } from './packDefinitions';
import { RARITY_ORDER } from './rarity';
import { devSampler, isOrgPoolStale, refreshOrgMembers } from './samplerStore';

/** Developers kept per (booster, rarity) for when GitHub is unavailable. */
const TARGET_PER_RARITY = 15;

export interface MaintenanceReport {
  maxId?: number;
  orgsRefreshed: Record<string, number>;
  added: Record<string, number>;
  expiredCacheRows: number;
  stoppedEarly: boolean;
}

/**
 * Daily maintenance for the booster sampler, time-boxed so it fits in one
 * serverless invocation; whatever is left continues on the next run.
 *
 * The fallback pool is filled by the same uniform sampler used by boosters,
 * so even the degraded mode draws from random developers of each pack.
 */
export async function rebuildFallbackPools(budgetMs = 50_000): Promise<MaintenanceReport> {
  const deadline = Date.now() + budgetMs;
  const report: MaintenanceReport = { orgsRefreshed: {}, added: {}, expiredCacheRows: 0, stoppedEarly: false };

  const { count } = await prisma.githubCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  report.expiredCacheRows = count;

  try {
    report.maxId = await devSampler.maxId();

    for (const org of BIG_TECH_ORGS) {
      if (Date.now() > deadline) throw new OutOfTime();
      if (await isOrgPoolStale(org)) report.orgsRefreshed[org] = await refreshOrgMembers(org);
    }

    for (const pack of ALL_PACKS) {
      for (const rarity of RARITY_ORDER) {
        if (pack.allCommon && rarity !== 'Common') continue;

        let have = await prisma.boosterFallbackDev.count({ where: { packId: pack.id, rarity } });
        const exclude = new Set(
          (await prisma.boosterFallbackDev.findMany({ where: { packId: pack.id }, select: { githubUsername: true } }))
            .map(d => d.githubUsername.toLowerCase()),
        );

        let misses = 0;
        while (have < TARGET_PER_RARITY && misses < 2) {
          if (Date.now() > deadline) throw new OutOfTime();
          const dev = await devSampler.drawDev(pack.pool, rarity, exclude);
          if (!dev) {
            misses++;
            continue;
          }
          exclude.add(dev.githubUsername.toLowerCase());
          if (dev.rarity !== rarity) continue; // star-bonus card: its stats belong to the next tier
          await prisma.boosterFallbackDev.upsert({
            where: { packId_githubUsername: { packId: pack.id, githubUsername: dev.githubUsername } },
            create: {
              packId: pack.id,
              githubUsername: dev.githubUsername,
              avatarUrl: dev.avatarUrl,
              name: dev.name,
              flavorText: dev.flavorText,
              atk: dev.atk,
              def: dev.def,
              hp: dev.hp,
              rarity,
              primaryLanguage: dev.primaryLanguage,
              topLanguages: dev.topLanguages,
            },
            update: {},
          });
          have++;
          report.added[`${pack.id}/${rarity}`] = (report.added[`${pack.id}/${rarity}`] ?? 0) + 1;
        }
      }
    }
  } catch (err) {
    if (err instanceof OutOfTime || err instanceof GitHubUnavailableError) {
      report.stoppedEarly = true;
    } else {
      throw err;
    }
  }

  return report;
}

class OutOfTime extends Error {}
