/**
 * Migration Script: Recalculate ATK, DEF, HP for all cards.
 * 
 * For each card in the database:
 *   1. Fetch fresh data from GitHub API using githubUsername
 *   2. Compute new ATK, DEF, HP with rebalanced formulas
 *   3. Update the card (rarity and primaryLanguage are NOT changed)
 *   4. Log old vs new stats for review
 *
 * Usage: node migrate_stats.js
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load .env manually (dotenv not installed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const prisma = new PrismaClient();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  Authorization: GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : '',
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'GitGatcha-Migration',
};

// Rate limit helper: wait between requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchGitHubData(username) {
  const userRes = await axios.get(`https://api.github.com/users/${username}`, { headers });
  const user = userRes.data;

  const reposRes = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100`, { headers });
  const repos = reposRes.data;

  let totalStars = 0;
  let totalForks = 0;
  for (const repo of repos) {
    totalStars += repo.stargazers_count;
    totalForks += repo.forks_count;
  }

  const accountAgeMs = new Date().getTime() - new Date(user.created_at).getTime();
  const accountAgeYears = accountAgeMs / (1000 * 60 * 60 * 24 * 365.25);

  return {
    totalStars,
    totalForks,
    publicRepos: user.public_repos,
    publicGists: user.public_gists || 0,
    followers: user.followers,
    accountAgeYears,
  };
}

function calculateNewStats(data) {
  const atk = Math.floor((Math.sqrt(data.totalStars) * 2 + Math.sqrt(data.totalForks)) * 10) + 10;
  const def = Math.floor(data.publicRepos * 15 + data.publicGists * 20) + Math.floor(data.followers * 0.5) + 50;
  const hp  = Math.floor(data.accountAgeYears * 50) + Math.floor(data.publicRepos * 5) + 200 + Math.floor(atk * 3);
  return { atk, def, hp };
}

async function main() {
  console.log('=== GitGatcha Stat Rebalance Migration ===\n');

  const cards = await prisma.card.findMany({
    select: { id: true, githubUsername: true, name: true, atk: true, def: true, hp: true },
  });

  console.log(`Found ${cards.length} cards to migrate.\n`);

  let updated = 0;
  let failed = 0;

  for (const card of cards) {
    try {
      const ghData = await fetchGitHubData(card.githubUsername);
      const newStats = calculateNewStats(ghData);

      await prisma.card.update({
        where: { id: card.id },
        data: { atk: newStats.atk, def: newStats.def, hp: newStats.hp },
      });

      console.log(`✅ ${card.githubUsername} (${card.name})`);
      console.log(`   ATK: ${card.atk} → ${newStats.atk}`);
      console.log(`   DEF: ${card.def} → ${newStats.def}`);
      console.log(`   HP:  ${card.hp} → ${newStats.hp}`);
      console.log('');

      updated++;

      // Respect GitHub API rate limits (~5000/hr with token → ~1.4/sec)
      await sleep(800);
    } catch (err) {
      console.log(`❌ FAILED: ${card.githubUsername} — ${err.message}`);
      failed++;
      await sleep(800);
    }
  }

  console.log('=== Migration Complete ===');
  console.log(`Updated: ${updated} | Failed: ${failed} | Total: ${cards.length}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
