/**
 * One free booster for visitors without an account (landing page → /try).
 *
 * The draw is the normal uniform one (reserve → live GitHub draw → existing
 * card) for the Mystery Box, the broadest pack. Nothing is given to anyone
 * yet: the cards are kept in a GuestPull row whose id lives in an httpOnly
 * cookie, and they move to the account created afterwards (see
 * claimGuestPull, called when a NEW player picks their username).
 */
import { prisma } from './prisma';
import { getPackById } from './packDefinitions';
import { samplerForToken } from './samplerStore';
import { addCardToUser, drawPackDevs, ensureMinimumRarity, getRaritiesForSlots, upsertCard } from './boosterService';

export const GUEST_PACK_ID = 'mystery-box';
export const GUEST_COOKIE = 'gg_guest_pull';
/** How long the cards wait for the visitor to sign up. */
export const GUEST_PULL_TTL_DAYS = 7;

const cardSelect = {
  id: true, githubUsername: true, name: true, avatarUrl: true, flavorText: true, atk: true, def: true, hp: true,
  rarity: true, primaryLanguage: true, followers: true, totalStars: true, totalForks: true, topRepoStars: true,
  publicRepos: true, publicGists: true, languageCount: true, githubCreatedAt: true,
} as const;

function isLive(pull: { createdAt: Date; claimedById: string | null }) {
  return !pull.claimedById && Date.now() - pull.createdAt.getTime() < GUEST_PULL_TTL_DAYS * 24 * 60 * 60 * 1000;
}

async function cardsOf(cardIds: string[]) {
  const cards = await prisma.card.findMany({ where: { id: { in: cardIds } }, select: cardSelect });
  // Keep the drawn order
  return cardIds.map(id => cards.find(c => c.id === id)).filter(c => !!c).map(c => ({
    ...c,
    avatarUrl: c.avatarUrl ?? '',
    primaryLanguage: c.primaryLanguage ?? 'Unknown',
  }));
}

export type GuestCard = Awaited<ReturnType<typeof cardsOf>>[number];

/** The visitor's pending pull (still claimable), or null. */
export async function getGuestPull(pullId: string | undefined) {
  if (!pullId) return null;
  const pull = await prisma.guestPull.findUnique({ where: { id: pullId } });
  if (!pull || !isLive(pull)) return null;
  return { id: pull.id, cards: await cardsOf(pull.cardIds) };
}

/** Draws the free pack and stores it for a later sign-up. Uses the server's GitHub token. */
export async function drawGuestPack(): Promise<{ id: string; cards: GuestCard[] }> {
  const pack = getPackById(GUEST_PACK_ID);
  if (!pack) throw new Error(`Guest pack ${GUEST_PACK_ID} not found`);
  let rarities = getRaritiesForSlots(pack.cardCount);
  if (pack.guaranteedMinRarity) rarities = ensureMinimumRarity(rarities, pack.guaranteedMinRarity);

  const { drawn, sources } = await drawPackDevs(pack.id, pack.pool, rarities, new Set(), samplerForToken(null));
  const cardIds: string[] = [];
  for (const [i, dev] of drawn.entries()) {
    try {
      cardIds.push((await upsertCard(dev, sources[i] !== 'fallback')).id);
    } catch (err) {
      console.error(`[Guest pack] Could not save ${dev.githubUsername}:`, (err as Error).message);
    }
  }
  if (cardIds.length === 0) throw new Error('No cards could be drawn right now');

  const pull = await prisma.guestPull.create({ data: { cardIds } });
  return { id: pull.id, cards: await cardsOf(cardIds) };
}

/**
 * Gives a visitor's free pack to the account that was just created. The claim
 * is atomic (a pull is only ever claimed once) and must only be called for new
 * players, so existing accounts can't farm a free pack a day by logging out.
 * Returns how many cards were added.
 */
export async function claimGuestPull(userId: string, pullId: string | undefined): Promise<number> {
  if (!pullId) return 0;
  const pull = await prisma.guestPull.findUnique({ where: { id: pullId } });
  if (!pull || !isLive(pull)) return 0;
  const claimed = await prisma.guestPull.updateMany({
    where: { id: pullId, claimedById: null },
    data: { claimedById: userId, claimedAt: new Date() },
  });
  if (claimed.count === 0) return 0;

  const cards = await prisma.card.findMany({ where: { id: { in: pull.cardIds } }, select: { id: true, rarity: true, primaryLanguage: true } });
  let added = 0;
  for (const card of cards) {
    try {
      await addCardToUser(userId, card);
      added++;
    } catch (err) {
      console.error(`[Guest pack] Could not give card ${card.id} to ${userId}:`, (err as Error).message);
    }
  }
  return added;
}
