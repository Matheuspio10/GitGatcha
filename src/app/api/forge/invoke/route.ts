import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { randomInt } from 'node:crypto';
import { withUserLock, UserFacingError, asRecord, asArray } from '@/lib/userLock';
import { fetchGitHubUserStats, toCardData } from '@/lib/githubService';
import { getInvocationCost } from '@/lib/forgeService';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { username } = await req.json();
    if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

    const stats = await fetchGitHubUserStats(username);
    if (!stats) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });
    if (!stats.primaryLanguage || stats.primaryLanguage === 'Unknown') {
      return NextResponse.json({ error: 'Developer lacks a primary language' }, { status: 400 });
    }

    const { fragments, bits } = getInvocationCost(stats.rarity);

    const userId = session.user.id;
    const lang = stats.primaryLanguage;

    let newCardStats;
    try {
      newCardStats = await withUserLock(userId, async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { currency: true, fragments: true, fragmentLogs: true },
        });
        if (!user) throw new UserFacingError('User not found', 404);

        const userFragments = asRecord(user.fragments);
        if ((userFragments[lang] || 0) < fragments) throw new UserFacingError('Not enough fragments');
        if (user.currency < bits) throw new UserFacingError('Not enough BITS');

        let card = await tx.card.findUnique({ where: { githubUsername: stats.githubUsername } });
        if (card && await tx.userCard.findFirst({ where: { userId, cardId: card.id }, select: { id: true } })) {
          throw new UserFacingError('You already own this developer');
        }
        if (!card) card = await tx.card.create({ data: toCardData(stats) });

        userFragments[lang] -= fragments;
        const logs = asArray(user.fragmentLogs);
        logs.unshift({
          date: new Date().toISOString(),
          source: `Invocation - ${stats.name || username}`,
          language: lang,
          amount: -fragments
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            currency: { decrement: bits },
            fragments: userFragments,
            fragmentLogs: logs
          }
        });

        const isShiny = randomInt(0, 100) < 5;
        const userCard = await tx.userCard.create({
          data: { userId, cardId: card.id, isShiny }
        });

        return { ...stats, isShiny, userCardId: userCard.id };
      });
    } catch (err) {
      if (err instanceof UserFacingError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    return NextResponse.json({ success: true, card: newCardStats });
  } catch (error) {
    console.error('Invocation error:', error);
    return NextResponse.json({ error: 'Invocation failed' }, { status: 500 });
  }
}
