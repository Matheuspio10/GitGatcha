import { NextResponse } from 'next/server';
import { fetchGitHubUserStats } from '@/lib/githubService';
import { getInvocationCost } from '@/lib/forgeService';
import { ALL_PACKS } from '@/lib/packDefinitions';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  try {
    const stats = await fetchGitHubUserStats(username);
    if (!stats) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });

    const cost = getInvocationCost(stats.rarity);
    
    // Find packs that might drop this language
    const lang = stats.primaryLanguage || 'Unknown';
    const recommendedPacks = ALL_PACKS.filter(p => p.themeLanguage === lang || p.buildQuery().includes(lang));

    return NextResponse.json({ stats, cost, recommendedPacks });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
