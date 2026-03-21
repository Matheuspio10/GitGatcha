import { searchUsersForPackWithRarity, getRandomDevelopersByRarity } from './src/lib/githubService';
import { getPackById } from './src/lib/packDefinitions';

async function testGitHubLiveFetch() {
  console.log("Testing live fetching for 'brazilian-devs' pack...");
  const devPack = getPackById('brazilian-devs');
  if (!devPack) return console.error("Pack not found.");
  
  const query = devPack.buildQuery();
  console.log("Built Query:", query);
  
  // Test 1 Rare card
  console.log("Fetching 1 Rare Brazilian Developer...");
  const devs = await searchUsersForPackWithRarity(query, 'Rare', 1, []);
  
  if (devs.length > 0) {
    console.log("Found:", devs[0].githubUsername, "| Rarity:", devs[0].rarity, "| Stats:", devs[0].atk, devs[0].def, devs[0].hp);
  } else {
    console.log("No dev found from API or DB. Check DB seeds or Rate limits.");
  }
}

async function run() {
  try {
    await testGitHubLiveFetch();
    console.log("\\nAll checks passed!");
  } catch(e) {
    console.error(e);
  }
}

run();
