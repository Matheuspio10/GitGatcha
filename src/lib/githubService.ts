import axios from 'axios';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_BASE = 'https://api.github.com';

const headers = {
  Authorization: GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : '',
  Accept: 'application/vnd.github.v3+json',
};

// Check if token is missing in production to prevent silent rate-limit bans
if (!GITHUB_TOKEN && process.env.NODE_ENV === 'production') {
  console.warn("WARNING: GITHUB_TOKEN is not set. API rate limits will be severely restricted.");
}

// Caching to memory to avoid ratelimits during local dev
import NodeCache from 'node-cache';
export const cache = new NodeCache({ stdTTL: 86400 });

function getRandomUserId(maxId: number = 150000000) {
  return Math.floor(Math.random() * maxId) + 1;
}

export async function fetchGitHubUserStats(username: string, expectedRarity?: string) {
  const cacheKey = expectedRarity ? `user_stats_${username}_${expectedRarity}` : `user_stats_${username}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as any;
  }

  try {
    const userRes = await axios.get(`${API_BASE}/users/${username}`, { headers });
    const user = userRes.data;
    
    // limited to 1 page for speed
    const reposRes = await axios.get(`${API_BASE}/users/${username}/repos?per_page=100`, { headers });
    const repos = reposRes.data;

    let totalStars = 0;
    let totalForks = 0;
    const languages: Record<string, number> = {};

    for (const repo of repos) {
      totalStars += repo.stargazers_count;
      totalForks += repo.forks_count;
      if (repo.language) {
        // Weight the language by repository size to determine dominant language by bytes/code quantity
        languages[repo.language] = (languages[repo.language] || 0) + (repo.size || 1);
      }
    }

    const primaryLanguage = Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0] || 'Unknown';
    
    const accountAgeMs = new Date().getTime() - new Date(user.created_at).getTime();
    const accountAgeYears = accountAgeMs / (1000 * 60 * 60 * 24 * 365.25);

    // Rebalanced stat formulas (sqrt compression for balanced battles)
    const baseAtk = Math.floor((Math.sqrt(totalStars) * 2 + Math.sqrt(totalForks)) * 10) + 10;
    const baseDef = Math.floor(user.public_repos * 15 + (user.public_gists || 0) * 20) + Math.floor(user.followers * 0.5) + 50;
    const baseHp = Math.floor(accountAgeYears * 50) + Math.floor(user.public_repos * 5) + 200 + Math.floor(baseAtk * 3);

    // Dynamic Power Score for accurate rarity determination at generation time
    const powerScore = (user.followers * 2) + totalStars * 2 + (totalForks * 2) + (user.public_repos * 5);

    let rarity = 'Common';
    // Base the rarity on the dynamically calculated powerScore instead of forcing it
    if (powerScore > 50000 || (user.company && ['google', 'microsoft', 'vercel', 'facebook', 'meta'].some(c => user.company.toLowerCase().includes(c)))) {
      rarity = 'Legendary';
    } else if (powerScore > 10000) {
      rarity = 'Epic';
    } else if (powerScore > 2500) {
      rarity = 'Rare';
    } else if (powerScore > 500) {
      rarity = 'Uncommon';
    }

    const rarityMultipliers: Record<string, number> = {
      'Common': 0.5,
      'Uncommon': 0.8,
      'Rare': 1.2,
      'Epic': 1.8,
      'Legendary': 2.5
    };
    const multiplier = rarityMultipliers[rarity] || 1.0;

    const atk = Math.max(10, Math.floor(baseAtk * multiplier));
    const def = Math.max(10, Math.floor(baseDef * multiplier));
    const hp = Math.max(50, Math.floor(baseHp * multiplier));

    const flavorText = user.bio || `Master of the ${primaryLanguage} shadows.`;

    const stats = {
      githubUsername: user.login,
      avatarUrl: user.avatar_url,
      name: user.name || user.login,
      flavorText,
      atk,
      def,
      hp,
      rarity,
      primaryLanguage
    };

    cache.set(cacheKey, stats);
    return stats;

  } catch (err) {
    console.error(`Error fetching user ${username}`, err);
    return null;
  }
}

import { prisma } from './prisma';

export async function searchUsersForPackWithRarity(baseQuery: string, targetRarity: string, count: number, ignoreSessionUsernames: string[] = []): Promise<any[]> {
  const results: any[] = [];
  let attempts = 0;
  
  while (results.length < count && attempts < 3) {
    attempts++;
    let searchQuery = baseQuery;
    
    // Append loose followers constraints purely to optimize finding the correct rarity tier
    if (targetRarity === 'Legendary') searchQuery += ' followers:>5000';
    else if (targetRarity === 'Epic') searchQuery += ' followers:1000..5000';
    else if (targetRarity === 'Rare') searchQuery += ' followers:200..1000';
    else if (targetRarity === 'Uncommon') searchQuery += ' followers:50..200';
    else searchQuery += ' followers:<50';

    // Randomize page offset for un-biased genuine randomness
    // High rarities have fewer pages on GitHub
    const maxPage = targetRarity === 'Legendary' ? 5 : targetRarity === 'Epic' ? 10 : 30; 
    const page = Math.floor(Math.random() * maxPage) + 1;
    
    const searchUrl = `${API_BASE}/search/users?q=${encodeURIComponent(searchQuery)}&per_page=30&page=${page}`;

    try {
      const res = await axios.get(searchUrl, { headers });
      const users = res.data.items || [];

      // Filter out cache session hits (recent 3 packs)
      let eligibleUsers = users.filter((u: any) => !ignoreSessionUsernames.includes(u.login));
      
      if (eligibleUsers.length === 0) {
        // If entirely filtered out (small pool), accept them anyway to avoid infinite loops, as per spec.
        eligibleUsers = users;
      }
      
      const shuffled = eligibleUsers.sort(() => 0.5 - Math.random());

      // Fetch full stats and enforce exact targetRarity AND strict primary language requirement
      for (const u of shuffled) {
        if (results.length >= count) break;
        
        // Ensure not querying duplicates already found
        if (results.some(r => r.githubUsername === u.login)) continue;
        
        const stats = await fetchGitHubUserStats(u.login);
        if (!stats) continue;

        if (stats.rarity !== targetRarity) continue;

        // Strict Primary Language Validation: 
        // GitHub search returns anyone who has even 1 repo in that language, but we only 
        // want them if it's their DOMINANT language.
        const langRegex = /language:([^\s]+)/ig;
        let match;
        const requiredLangs: string[] = [];
        while ((match = langRegex.exec(baseQuery)) !== null) {
          requiredLangs.push(match[1].toLowerCase());
        }

        if (requiredLangs.length > 0) {
          const userPrimary = stats.primaryLanguage.toLowerCase();
          if (!requiredLangs.includes(userPrimary)) {
            continue; // Does not qualify for this language booster
          }
        }

        results.push(stats);
      }
    } catch (err) {
      console.error('Error in search API for themed pack', err);
    }
  }

  // Graceful degradation: If API is rate-limited or pool small, fallback to DB pre-cached pool
  if (results.length < count) {
    console.warn(`Shortfall of ${count - results.length} for ${targetRarity}. Falling back to DB pool.`);
    try {
      // Basic language matching if base query has language
      const langMatch = baseQuery.match(/language:([^\s]+)/i);
      const languageFilter = langMatch ? langMatch[1] : undefined;
      
      const dbFallbacks = await prisma.card.findMany({
        where: { 
          rarity: targetRarity,
          ...(languageFilter ? { primaryLanguage: { contains: languageFilter, mode: 'insensitive' } } : {})
        },
      });
      
      let validFallbacks = dbFallbacks.filter(c => 
        !ignoreSessionUsernames.includes(c.githubUsername) && 
        !results.some(r => r.githubUsername === c.githubUsername)
      );

      // Relax cache constraints if strict fallback yields nothing
      if (validFallbacks.length === 0) {
        validFallbacks = dbFallbacks.filter(c => !results.some(r => r.githubUsername === c.githubUsername));
      }
      
      const shuffledFallbacks = validFallbacks.sort(() => 0.5 - Math.random()).slice(0, count - results.length);
      results.push(...shuffledFallbacks);
    } catch (e) {
      console.error('Failed fetching fallback developers from DB', e);
    }
  }

  return results;
}

export async function getRandomDevelopersByRarity(rarity: string, limit: number = 1, ignoreSession: string[] = []): Promise<any[]> {
  return searchUsersForPackWithRarity("type:user", rarity, limit, ignoreSession);
}
