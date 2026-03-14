import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import CollectionClient from './CollectionClient';

export default async function CollectionPage() {
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
    userCardId: uc.id,
    name: uc.card.name,
    githubUsername: uc.card.githubUsername,
    avatarUrl: uc.card.avatarUrl || '',
    flavorText: uc.card.flavorText,
    atk: uc.card.atk,
    def: uc.card.def,
    hp: uc.card.hp,
    rarity: uc.card.rarity,
    primaryLanguage: uc.card.primaryLanguage || 'Unknown',
    quantity: uc.quantity,
    shards: uc.shards,
    isShiny: uc.isShiny,
    stamina: uc.stamina,
    lastUsedAt: uc.lastUsedAt,
    inActiveTeam: uc.inActiveTeam,
  }));

  return <CollectionClient initialCards={cardsList} />;
}
