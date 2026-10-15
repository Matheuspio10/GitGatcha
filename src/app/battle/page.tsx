import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
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

  const t = await getTranslations('battle');
  const allCards = await prisma.card.findMany({ select: { atk: true, def: true, hp: true } });
  const avgPower = allCards.length > 0 ? allCards.reduce((acc, c) => acc + c.atk + c.def + c.hp, 0) / allCards.length : 0;
  const powerCap = Math.floor(avgPower * 3);

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
    pack: 'Unknown', // the Card row has no pack column yet (see getCardType)
    stamina: uc.stamina,
    lastUsedAt: uc.lastUsedAt,
    inActiveTeam: uc.inActiveTeam,
  }));

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white font-bold">{t('loadingArena')}</div>}>
      <BattleClient userCards={cardsList} userId={user.id} powerCap={powerCap} userBits={user.currency} />
    </Suspense>
  );
}
