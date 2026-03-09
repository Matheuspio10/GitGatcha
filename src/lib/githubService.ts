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

export async function fetchGitHubUserStats(username: string) {
  const cacheKey = `user_stats_${username}`;
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

    // Calculate normalized 0-100 attributes
    // Calculate normalized attributes without arbitrary caps
    // Calculate balanced attributes using logarithmic scaling
    const atk = Math.floor(25 * Math.log10(totalStars + totalForks + 1)) + 10;
    const def = Math.floor(20 * Math.log10(user.public_repos + 1)) + 10;
    const hp = Math.floor(40 * Math.log10(user.followers + 1)) + Math.floor(accountAgeYears * 5) + 50;

    // Rarity determination
    let rarity = 'Common';
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

export async function searchUsersForPack(query: string, count: number): Promise<any[]> {
  const page = Math.floor(Math.random() * 10) + 1;
  const searchUrl = `${API_BASE}/search/users?q=${encodeURIComponent(query)}&per_page=${Math.min(count * 3, 30)}&page=${page}`;

  try {
    const res = await axios.get(searchUrl, { headers });
    const users = res.data.items || [];

    // Shuffle and take the required count
    const shuffled = users.sort(() => 0.5 - Math.random()).slice(0, count);

    const results = [];
    for (const u of shuffled) {
      const stats = await fetchGitHubUserStats(u.login);
      if (stats) results.push(stats);
    }
    return results;

  } catch (err) {
    console.error('Error searching users for pack', err);
    return [];
  }
}

export async function getRandomDevelopersByRarity(rarity: string, limit: number = 1): Promise<any[]> {
  // Query strings to match rarity bands
  let query = 'type:user';
  if (rarity === 'Legendary') query += ' followers:>25000';
  else if (rarity === 'Epic') query += ' followers:5000..25000';
  else if (rarity === 'Rare') query += ' followers:1000..5000';
  else if (rarity === 'Uncommon') query += ' followers:200..1000';
  else query += ' followers:<200';

  // pick a random page up to 10 (since pagination limit might apply)
  const page = Math.floor(Math.random() * 10) + 1;
  const searchUrl = `${API_BASE}/search/users?q=${encodeURIComponent(query)}&per_page=${limit}&page=${page}`;

  try {
    const res = await axios.get(searchUrl, { headers });
    const users = res.data.items;
    
    // We get only usernames, we need to fetch their full stats
    const results = [];
    for (const u of users) {
      const stats = await fetchGitHubUserStats(u.login);
      if (stats) results.push(stats);
    }
    return results;

  } catch (err) {
    console.error(`Error searching users for rarity ${rarity}`, err);
    return [];
  }
}
