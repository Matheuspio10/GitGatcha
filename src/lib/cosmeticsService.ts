import { prisma } from './prisma';
import {
  FRAMES,
  TITLES,
  collectionProgress,
  cosmeticContext,
  frameById,
  publicFrame,
  publicTitle,
  titleById,
  type CosmeticContext,
  type SetProgress,
} from './collections';

/** Set progress and unlock context of a player, from their level and cards. */
export async function getCosmeticContext(userId: string): Promise<{ progress: SetProgress[]; ctx: CosmeticContext } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, cards: { select: { card: { select: { primaryLanguage: true, rarity: true } } } } },
  });
  if (!user) return null;
  const progress = collectionProgress(user.cards.map(uc => uc.card));
  return { progress, ctx: cosmeticContext(user.level, progress) };
}

/** Every title and frame with whether this player unlocked it (for the picker). */
export function cosmeticOptions(ctx: CosmeticContext) {
  return {
    titles: TITLES.map(t => ({ ...publicTitle(t)!, requirement: t.requirement, unlocked: t.unlocked(ctx) })),
    frames: FRAMES.map(f => ({ ...publicFrame(f)!, requirement: f.requirement, unlocked: f.unlocked(ctx) })),
  };
}

/** The title and frame a player shows (stored ids that no longer exist are ignored). */
export function equippedCosmetics(user: { title: string | null; frame: string | null }) {
  return { title: publicTitle(titleById(user.title)), frame: publicFrame(frameById(user.frame)) };
}
