import { prisma } from './prisma';
import { lockUser, type Tx } from './userLock';
import { giftedCopy } from './gifts';

/**
 * Moving a card from one player to another, shared by gifts (giftService.ts)
 * and trades (tradeService.ts). Always inside a transaction that holds both
 * players' locks (lockPlayers).
 */

/** Takes the locks of several players, always in the same order, so two transfers between the same players can't deadlock. */
export async function lockPlayers(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await lockUser(tx, id);
}

/** A player's copy of a card, with what decides whether it can change hands. */
export const ownedCardSelect = {
  id: true, userId: true, cardId: true, isShiny: true, edition: true, inActiveTeam: true, stamina: true, lastUsedAt: true,
  trainingLevel: true, loyaltyCount: true,
  card: { select: { name: true, rarity: true, avatarUrl: true, githubUsername: true } },
} as const;

/** Whether an open challenge of the player holds this copy in its saved team. */
export async function inPendingChallenge(db: Tx | typeof prisma, userId: string, userCardId: string): Promise<boolean> {
  const open = await db.battle.findMany({
    where: { challengerId: userId, status: { in: ['PENDING', 'RESOLVING'] } },
    select: { challengerTeam: true },
  });
  return open.some(b => Array.isArray(b.challengerTeam)
    && b.challengerTeam.some(c => !!c && typeof c === 'object' && (c as { id?: unknown }).id === userCardId));
}

/** The copies (by UserCard id) that the player's open challenges hold. */
export async function cardsInPendingChallenges(db: Tx | typeof prisma, userId: string): Promise<Set<string>> {
  const open = await db.battle.findMany({
    where: { challengerId: userId, status: { in: ['PENDING', 'RESOLVING'] } },
    select: { challengerTeam: true },
  });
  const ids = new Set<string>();
  for (const b of open) {
    if (!Array.isArray(b.challengerTeam)) continue;
    for (const c of b.challengerTeam) {
      const id = !!c && typeof c === 'object' ? (c as { id?: unknown }).id : null;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

/**
 * Moves the copy to `receiverId`: the old one is deleted and a fresh one created
 * (giftedCopy: the developer, Shiny and stamina travel; training and loyalty start over).
 */
export async function moveCard(
  tx: Tx,
  owned: { id: string; cardId: string; isShiny: boolean; stamina: number; lastUsedAt: Date },
  receiverId: string,
) {
  await tx.userCard.delete({ where: { id: owned.id } });
  return tx.userCard.create({ data: giftedCopy(owned, receiverId), select: { id: true } });
}
