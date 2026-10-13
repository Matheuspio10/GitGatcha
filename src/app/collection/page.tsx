import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import CollectionClient from './CollectionClient';
import { OnboardingStepMarker } from '@/components/OnboardingStepMarker';

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
    edition: uc.edition,
    stamina: uc.stamina,
    lastUsedAt: uc.lastUsedAt,
    inActiveTeam: uc.inActiveTeam,
    loyaltyCount: uc.loyaltyCount,
    loyaltyTier: uc.loyaltyTier,
    loyaltyMilestones: uc.loyaltyMilestones as any[],
    lifetimeStats: uc.lifetimeStats as any,
    showcaseOrder: uc.showcaseOrder,
  }));

  // New players: visiting the collection completes a "Getting started" step
  const markCollection = !!user.onboarding && !user.onboarding.collectionSeen;

  return (
    <>
      {markCollection && <OnboardingStepMarker action="collection-seen" />}
      <CollectionClient initialCards={cardsList} />
    </>
  );
}
