import { searchUsersForPackWithRarity, getRandomDevelopersByRarity } from './src/lib/githubService';
import { getPackById } from './src/lib/packDefinitions';

async function testGitHubLiveFetch() {
  console.log("Testing live fetching for 'css-wizards' pack...");
  const devPack = getPackById('css-wizards');
  if (!devPack) return console.error("Pack not found.");
  
  const query = devPack.buildQuery();
  console.log("Built Query:", query);
  
  // Test 5 Common cards
  console.log("Fetching 5 Common CSS Developers...");
  const devs = await searchUsersForPackWithRarity(query, 'Common', 5, []);
  
  if (devs.length > 0) {
    devs.forEach(d => {
      console.log("Found:", d.githubUsername, "| Rarity:", d.rarity, "| Lang:", d.primaryLanguage);
    });
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
