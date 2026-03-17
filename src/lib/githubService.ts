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
        languages[repo.language] = (languages[repo.language] || 0) + 1;
      }
    }

    const primaryLanguage = Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0] || 'Unknown';
    
    const accountAgeMs = new Date().getTime() - new Date(user.created_at).getTime();
    const accountAgeYears = accountAgeMs / (1000 * 60 * 60 * 24 * 365.25);

    // Rebalanced stat formulas (sqrt compression for balanced battles)
    const baseAtk = Math.floor((Math.sqrt(totalStars) * 2 + Math.sqrt(totalForks)) * 10) + 10;
    const baseDef = Math.floor(user.public_repos * 15 + (user.public_gists || 0) * 20) + Math.floor(user.followers * 0.5) + 50;
    const baseHp = Math.floor(accountAgeYears * 50) + Math.floor(user.public_repos * 5) + 200 + Math.floor(baseAtk * 3);

    // Rarity determination
    let rarity = expectedRarity || 'Common';
    
    // Only calculate natural rarity if one wasn't explicitly requested by a pack drop
    if (!expectedRarity) {
      const score = user.followers * 2 + totalStars;
      if (score > 50000 || (user.company && ['google', 'microsoft', 'vercel', 'facebook', 'meta'].some(c => user.company.toLowerCase().includes(c)))) {
        rarity = 'Legendary';
      } else if (score > 10000) {
        rarity = 'Epic';
      } else if (score > 2500) {
        rarity = 'Rare';
      } else if (score > 500) {
        rarity = 'Uncommon';
      }
    }

    // Apply rarity multipliers so low-rarity cards are definitively weaker
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

export async function searchUsersForPackWithRarity(baseQuery: string, rarity: string, count: number): Promise<any[]> {
  // Append rarity followers constraint to the base query
  let query = baseQuery;
  
  // Inject a random character for lower rarities to bypass GitHub's 1000 result limit
  if (['Common', 'Uncommon', 'Rare'].includes(rarity)) {
    const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // 'a' through 'z'
    query += ` ${randomChar}`;
  }

  if (rarity === 'Legendary') query += ' followers:>25000';
  else if (rarity === 'Epic') query += ' followers:5000..25000';
  else if (rarity === 'Rare') query += ' followers:1000..5000';
  else if (rarity === 'Uncommon') query += ' followers:200..1000';
  else query += ' followers:<200';

  // Use 100 per page to pull a large chunk (up to rank 1000) and get variety
  const page = Math.floor(Math.random() * 10) + 1;
  const searchUrl = `${API_BASE}/search/users?q=${encodeURIComponent(query)}&per_page=100&page=${page}`;

  try {
    const res = await axios.get(searchUrl, { headers });
    const users = res.data.items || [];

    // Shuffle and take the required count
    const shuffled = users.sort(() => 0.5 - Math.random()).slice(0, count);

    const results = [];
    for (const u of shuffled) {
      const stats = await fetchGitHubUserStats(u.login, rarity);
      if (stats) results.push(stats);
    }
    return results;

  } catch (err) {
    console.error('Error searching users for pack with rarity', err);
    return [];
  }
}

export async function getRandomDevelopersByRarity(rarity: string, limit: number = 1): Promise<any[]> {
  const results: any[] = [];
  const MAX_GLOBAL_GITHUB_ID = 150000000;

  // We loop because we need to keep drawing mathematically random users
  // until we organically find `limit` number of users that match the requested rarity tier.
  while (results.length < limit) {
    const randomId = getRandomUserId(MAX_GLOBAL_GITHUB_ID);
    const searchUrl = `${API_BASE}/users?since=${randomId}&per_page=30`;

    try {
      const res = await axios.get(searchUrl, { headers });
      const users = res.data || [];
      
      // Shuffle the block of users we just pulled to ensure we aren't bias-selecting sequentially
      const shuffled = users.sort(() => 0.5 - Math.random());

      for (const u of shuffled) {
        if (results.length >= limit) break;

        // Note: fetchGitHubUserStats calculates their absolute 'natural' rarity organically
        // unless you force it (which we aren't doing here, we are inspecting them).
        const stats = await fetchGitHubUserStats(u.login); 
        
        if (stats && stats.rarity === rarity) {
           results.push(stats);
        }
      }
    } catch (err) {
      console.error(`Error fetching random batch since ID ${randomId}:`, err);
      // Even if one batch fails, the while loop will simply try a new random ID next loop.
    }
  }

  return results;
}
