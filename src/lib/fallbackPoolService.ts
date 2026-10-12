import { prisma } from './prisma';
import { GitHubUnavailableError } from './githubService';
import { ALL_PACKS, BIG_TECH_ORGS } from './packDefinitions';
import { RARITY_ORDER } from './rarity';
import { devSampler, isOrgPoolStale, refreshOrgMembers } from './samplerStore';
import { purgeStaleReserve, refillReserve, reserveDeficit } from './boosterReserve';

export interface MaintenanceReport {
  maxId?: number;
  orgsRefreshed: Record<string, { done: boolean; saved: number }>;
  reserveAdded: Record<string, number>;
  expiredCacheRows: number;
  staleReserveRows: number;
  stoppedEarly: boolean;
}

/**
 * Daily maintenance for the booster sampler, time-boxed so it fits in one
 * serverless invocation; whatever is left continues on the next run.
 *
 * Refreshes the Big Tech org pools and tops up the consumable booster reserve
 * (see boosterReserve.ts), drawing with the same uniform sampler as live boosters.
 */
export async function rebuildFallbackPools(budgetMs = 270_000): Promise<MaintenanceReport> {
  const deadline = Date.now() + budgetMs;
  const report: MaintenanceReport = { orgsRefreshed: {}, reserveAdded: {}, expiredCacheRows: 0, staleReserveRows: 0, stoppedEarly: false };

  report.expiredCacheRows = (await prisma.githubCache.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count;
  report.staleReserveRows = await purgeStaleReserve();

  try {
    report.maxId = await devSampler.maxId();

    for (const org of BIG_TECH_ORGS) {
      if (Date.now() > deadline) throw new OutOfTime();
      if (await isOrgPoolStale(org)) {
        report.orgsRefreshed[org] = await refreshOrgMembers(org, deadline);
        if (!report.orgsRefreshed[org].done) throw new OutOfTime(); // resumes on the next run
      }
    }

    // Biggest gaps first, so a short run still helps the emptiest slots
    const gaps: { packId: string; rarity: (typeof RARITY_ORDER)[number]; deficit: number }[] = [];
    for (const pack of ALL_PACKS) {
      for (const rarity of RARITY_ORDER) {
        if (pack.allCommon && rarity !== 'Common') continue;
        const deficit = await reserveDeficit(pack.id, rarity);
        if (deficit > 0) gaps.push({ packId: pack.id, rarity, deficit });
      }
    }
    gaps.sort((a, b) => b.deficit - a.deficit);

    for (const { packId, rarity, deficit } of gaps) {
      if (Date.now() > deadline) throw new OutOfTime();
      const pack = ALL_PACKS.find(p => p.id === packId)!;
      const added = await refillReserve(devSampler, packId, pack.pool, rarity, deficit, deadline);
      if (added) report.reserveAdded[`${packId}/${rarity}`] = added;
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
