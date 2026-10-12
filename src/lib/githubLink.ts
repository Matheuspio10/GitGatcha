/**
 * Rewards for connecting a GitHub account (on sign-up with GitHub or when a
 * logged-in player links it from their profile):
 *  - a one-time BITS bonus;
 *  - the player's own card in the Signature edition. It never drops from
 *    boosters or the forge, and GitHub accounts can only be linked to one
 *    player, so only the real owner of the account can hold it.
 */
import { prisma } from './prisma';
import { fetchGitHubUserStats, getTokenOwnerLogin, toCardData } from './githubService';
import { withUserLock } from './userLock';

export const GITHUB_LINK_BONUS = 300;
export const SIGNATURE_EDITION = 'signature';

export async function grantGithubLinkRewards(userId: string, token: string | null | undefined) {
  await prisma.user.updateMany({
    where: { id: userId, githubBonusGranted: false },
    data: { githubBonusGranted: true, currency: { increment: GITHUB_LINK_BONUS } },
  });

  if (token) await grantSignatureCard(userId, token);
}

/** Gives (or upgrades to) the Signature edition of the token owner's own card. Idempotent. */
export async function grantSignatureCard(userId: string, token: string) {
  const login = await getTokenOwnerLogin(token);
  if (!login) return null;
  const stats = await fetchGitHubUserStats(login, token);
  if (!stats) return null;

  const data = toCardData(stats);
  const card = await prisma.card.upsert({
    where: { githubUsername: stats.githubUsername },
    create: data,
    update: data,
  });

  // Whoever linked this GitHub account before keeps the card, but not the Signature edition
  await prisma.userCard.updateMany({
    where: { cardId: card.id, edition: SIGNATURE_EDITION, userId: { not: userId } },
    data: { edition: 'standard' },
  });

  return withUserLock(userId, async (tx) => {
    const owned = await tx.userCard.findFirst({ where: { userId, cardId: card.id }, orderBy: { createdAt: 'asc' } });
    if (owned) {
      return tx.userCard.update({ where: { id: owned.id }, data: { edition: SIGNATURE_EDITION } });
    }
    return tx.userCard.create({ data: { userId, cardId: card.id, edition: SIGNATURE_EDITION } });
  });
}
