import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchGitHubUserStats } from '@/lib/githubService';
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

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userFragments = (user.fragments && typeof user.fragments === 'object' && !Array.isArray(user.fragments) ? user.fragments : {}) as Record<string, number>;
    const ownedFragments = userFragments[stats.primaryLanguage] || 0;

    if (ownedFragments < fragments) {
      return NextResponse.json({ error: 'Not enough fragments' }, { status: 400 });
    }
    if (user.currency < bits) {
      return NextResponse.json({ error: 'Not enough BITS' }, { status: 400 });
    }

    // Deduct
    userFragments[stats.primaryLanguage] -= fragments;
    
    // Add logs
    const logs = Array.isArray(user.fragmentLogs) ? [...user.fragmentLogs] : [];
    logs.unshift({
      date: new Date().toISOString(),
      source: `Invocation - ${stats.name || username}`,
      language: stats.primaryLanguage,
      amount: -fragments
    });

    let newCardStats = null;

    await prisma.$transaction(async (tx) => {
      // Deduct bits & fragments
      await tx.user.update({
        where: { id: user.id },
        data: {
          currency: { decrement: bits },
          fragments: userFragments,
          fragmentLogs: logs
        }
      });

      // Upsert card
      let card = await tx.card.findUnique({ where: { githubUsername: stats.githubUsername } });
      if (!card) {
        card = await tx.card.create({ data: stats });
      }

      // Add to user
      const isShiny = Math.random() < 0.05;
      const userCard = await tx.userCard.create({
        data: { userId: user.id, cardId: card.id, isShiny }
      });

      newCardStats = { ...stats, isShiny, userCardId: userCard.id };
    });

    return NextResponse.json({ success: true, card: newCardStats });
  } catch (error) {
    console.error('Invocation error:', error);
    return NextResponse.json({ error: 'Invocation failed' }, { status: 500 });
  }
}
