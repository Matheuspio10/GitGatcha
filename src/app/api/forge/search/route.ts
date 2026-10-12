import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchGitHubUserStats, isValidGitHubLogin } from '@/lib/githubService';
import { getInvocationCost } from '@/lib/forgeService';
import { ALL_PACKS, getSerializablePacks } from '@/lib/packDefinitions';

export async function GET(req: Request) {
  // Each lookup spends the server's GitHub quota: logged-in players only
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });
  if (!isValidGitHubLogin(username)) return NextResponse.json({ error: 'Invalid GitHub username' }, { status: 400 });

  try {
    const stats = await fetchGitHubUserStats(username);
    if (!stats) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });

    const cost = getInvocationCost(stats.rarity);
    
    // Find packs that might drop this language
    const lang = stats.primaryLanguage || 'Unknown';
    const recommendedPacks = getSerializablePacks().filter(p => p.themeLanguage === lang || ALL_PACKS.find(a => a.id === p.id)?.pool.languages?.includes(lang));

    return NextResponse.json({ stats, cost, recommendedPacks });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
