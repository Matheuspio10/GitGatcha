import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchGitHubUserStats, isValidGitHubLogin } from '@/lib/githubService';
import { getSerializablePacks, storePacks } from '@/lib/packDefinitions';
import { forgeCostFor, isFeaturedDev } from '@/lib/weeklyEvents';
import { getFeaturedDevLogin } from '@/lib/weeklyEventService';
import { enforceRateLimit } from '@/lib/rateLimit';
import { apiError } from '@/lib/apiResponse';

export async function GET(req: Request) {
  // Each lookup spends the server's GitHub quota: logged-in players only
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return apiError('common.unauthorized', 401);

  const limited = await enforceRateLimit(req, 'forge-search', 30, 60, session.user.id);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) return apiError('forge.usernameRequired');
  if (!isValidGitHubLogin(username)) return apiError('forge.invalidUsername');

  try {
    const stats = await fetchGitHubUserStats(username);
    if (!stats) return apiError('forge.devNotFound', 404);

    // The Dev of the Week costs less this week
    const featured = isFeaturedDev(stats.githubUsername, await getFeaturedDevLogin());
    const cost = forgeCostFor(stats.rarity, featured);
    const fullCost = forgeCostFor(stats.rarity, false);

    // Packs on sale now that might drop this language
    const lang = stats.primaryLanguage || 'Unknown';
    const recommendedPacks = getSerializablePacks(storePacks(new Date()).filter(p => p.themeLanguage === lang || p.pool.languages?.includes(lang)));

    return NextResponse.json({ stats, cost, fullCost, featured, recommendedPacks });
  } catch (error) {
    console.error('Search error:', error);
    return apiError('forge.searchFailed', 500);
  }
}
