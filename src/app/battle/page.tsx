import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import BattleClient from './BattleClient';

export default async function BattlePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  const userCards = await prisma.userCard.findMany({
    where: { userId: user.id },
    include: { card: true },
    orderBy: { card: { atk: 'desc' } }
  });

  const cardsList = userCards.map(uc => ({
    id: uc.card.id,
    name: uc.card.name,
    githubUsername: uc.card.githubUsername,
    avatarUrl: uc.card.avatarUrl || '',
    flavorText: uc.card.flavorText,
    atk: uc.card.atk,
    def: uc.card.def,
    hp: uc.card.hp,
    rarity: uc.card.rarity,
    primaryLanguage: uc.card.primaryLanguage || 'Unknown',
    pack: (uc.card as any).pack || 'Unknown',
    stamina: uc.stamina,
    lastUsedAt: uc.lastUsedAt,
    inActiveTeam: uc.inActiveTeam,
  }));

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white font-bold">Loading Arena...</div>}>
      <BattleClient userCards={cardsList} userId={user.id} />
    </Suspense>
  );
}
