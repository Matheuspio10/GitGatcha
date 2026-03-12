import { fetchGitHubUserStats } from './src/lib/githubService';

async function testScaling() {
  const username = 'filipedeschamps'; // A well known user
  
  console.log("Testing base stats (Legendary):");
  const leg = await fetchGitHubUserStats(username, 'Legendary');
  console.log(`ATK: ${leg.atk} DEF: ${leg.def} HP: ${leg.hp}`);

  console.log("\nTesting scaled down stats (Common):");
  // Bypass cache manually because it wasn't cleared but different Expected Rarity key helps
  const com = await fetchGitHubUserStats(username, 'Common');
  console.log(`ATK: ${com.atk} DEF: ${com.def} HP: ${com.hp}`);
}

testScaling().catch(console.error);
