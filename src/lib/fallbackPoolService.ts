import { prisma } from './prisma';
import { fetchGitHubUserStats, cache } from './githubService';
import { ALL_PACKS } from './packDefinitions';
import axios from 'axios';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_BASE = 'https://api.github.com';

const headers = {
  Authorization: GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : '',
  Accept: 'application/vnd.github.v3+json',
};

const TARGET_POOL_SIZE = 300;
const RATE_LIMIT_DELAY_MS = 2000; // 2s between API calls to respect rate limits

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDateSlice(): string {
  const start = new Date('2008-04-01').getTime();
  const end = new Date().getTime() - (30 * 24 * 60 * 60 * 1000);

  const randomStartMs = start + Math.random() * (end - start);
  const randomEndMs = randomStartMs + (30 * 24 * 60 * 60 * 1000);

  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
  };

  return `created:${formatDate(randomStartMs)}..${formatDate(randomEndMs)}`;
}

/**
 * Rebuilds the fallback pool for all language-category boosters.
 * Queries GitHub for developers qualifying under the top-3 language rule,
 * storing up to TARGET_POOL_SIZE unique developers per pack.
 */
export async function rebuildFallbackPools(): Promise<Record<string, number>> {
  const languagePacks = ALL_PACKS.filter(p => p.category === 'language');
  const results: Record<string, number> = {};

  for (const pack of languagePacks) {
    const existingCount = await prisma.boosterFallbackDev.count({
      where: { packId: pack.id },
    });

    // Skip if already has enough diversity
    if (existingCount >= TARGET_POOL_SIZE) {
      results[pack.id] = existingCount;
      continue;
    }

    const needed = TARGET_POOL_SIZE - existingCount;
    let added = 0;
    let apiCalls = 0;
    const maxApiCalls = 30; // Safety limit per pack

    // Extract language filter from pack query
    const baseQuery = pack.buildQuery();
    const langRegex = /language:([^\s]+)/ig;
    let match;
    const requiredLangs: string[] = [];
    while ((match = langRegex.exec(baseQuery)) !== null) {
      requiredLangs.push(match[1].toLowerCase());
    }

    while (added < needed && apiCalls < maxApiCalls) {
      apiCalls++;

      // Build search query with random date slice for diversity
      let searchQuery = baseQuery;
      if (!searchQuery.includes('created:')) {
        searchQuery += ` ${getRandomDateSlice()}`;
      }

      const page = Math.floor(Math.random() * 30) + 1;
      const searchUrl = `${API_BASE}/search/users?q=${encodeURIComponent(searchQuery)}&per_page=30&page=${page}`;

      try {
        const res = await axios.get(searchUrl, { headers });
        const users = res.data.items || [];

        // Shuffle for randomness
        const shuffled = users.sort(() => 0.5 - Math.random());

        for (const u of shuffled) {
          if (added >= needed) break;

          try {
            const stats = await fetchGitHubUserStats(u.login);
            if (!stats) continue;

            // Top-3 language qualification
            if (requiredLangs.length > 0) {
              const userTop3 = (stats.topLanguages || [stats.primaryLanguage]).map((l: string) => l.toLowerCase());
              if (!requiredLangs.some(lang => userTop3.includes(lang))) {
                continue;
              }
            }

            // Upsert into fallback pool
            await prisma.boosterFallbackDev.upsert({
              where: {
                packId_githubUsername: {
                  packId: pack.id,
                  githubUsername: stats.githubUsername,
                },
              },
              update: {
                avatarUrl: stats.avatarUrl,
                name: stats.name,
                flavorText: stats.flavorText,
                atk: stats.atk,
                def: stats.def,
                hp: stats.hp,
                rarity: stats.rarity,
                primaryLanguage: stats.primaryLanguage,
                topLanguages: stats.topLanguages || [],
              },
              create: {
                packId: pack.id,
                githubUsername: stats.githubUsername,
                avatarUrl: stats.avatarUrl,
                name: stats.name,
                flavorText: stats.flavorText,
                atk: stats.atk,
                def: stats.def,
                hp: stats.hp,
                rarity: stats.rarity,
                primaryLanguage: stats.primaryLanguage,
                topLanguages: stats.topLanguages || [],
              },
            });

            added++;
          } catch (innerErr) {
            // Skip individual user failures
            continue;
          }

          await sleep(RATE_LIMIT_DELAY_MS);
        }
      } catch (err: any) {
        if (err?.response?.status === 403 || err?.response?.status === 429) {
          console.warn(`[FallbackPool] Rate limited for "${pack.name}". Waiting 60s...`);
          await sleep(60000);
        } else {
          console.error(`[FallbackPool] Search error for "${pack.name}":`, err?.message);
        }
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    const finalCount = await prisma.boosterFallbackDev.count({
      where: { packId: pack.id },
    });

    results[pack.id] = finalCount;
  }

  return results;
}
