import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { activeEventPack } from './packDefinitions';
import { ensureSprint } from './sprintService';
import { sprintThemeById, type SprintTheme } from './sprints';
import { FEATURED_DEV_DISCOUNT, featuredDevRarities } from './weeklyEvents';

const FEATURED_CARD_SELECT = { githubUsername: true, name: true, avatarUrl: true, rarity: true, primaryLanguage: true, atk: true, def: true, hp: true } as const;

/**
 * Draws the Dev of the Week: uniformly among the cards in the game of the theme
 * with at least FEATURED_DEV_MIN_RARITY (any rarity of the theme when none).
 */
async function drawFeaturedDev(theme: SprintTheme): Promise<string | null> {
  const ofTheme = { primaryLanguage: { in: theme.languages } };
  let pool = await prisma.card.findMany({
    where: { ...ofTheme, rarity: { in: featuredDevRarities() } },
    select: { githubUsername: true },
    orderBy: { githubUsername: 'asc' },
  });
  if (pool.length === 0) {
    pool = await prisma.card.findMany({ where: ofTheme, select: { githubUsername: true }, orderBy: { githubUsername: 'asc' } });
  }
  return pool.length > 0 ? pool[randomInt(0, pool.length)].githubUsername : null;
}

/**
 * The running Weekly Sprint row with its Dev of the Week, drawn the first time
 * anyone asks. Only a row still without one is written, so two parallel requests
 * agree on the same dev.
 */
async function weeklySprintWithFeatured(now: Date) {
  const sprint = await ensureSprint('weekly', now);
  if (sprint.featuredDev) return sprint;
  const login = await drawFeaturedDev(sprintThemeById(sprint.theme));
  if (!login) return sprint;
  await prisma.sprint.updateMany({ where: { id: sprint.id, featuredDev: null }, data: { featuredDev: login } });
  return prisma.sprint.findUniqueOrThrow({ where: { id: sprint.id } });
}

/** Login of this week's Dev of the Week (null while the theme has no cards). */
export async function getFeaturedDevLogin(now = new Date()): Promise<string | null> {
  return (await weeklySprintWithFeatured(now)).featuredDev;
}

/** This week's event: the theme, when it ends, the event pack on sale and the Dev of the Week. */
export async function getWeeklyEvent(now = new Date()) {
  const sprint = await weeklySprintWithFeatured(now);
  const featuredCard = sprint.featuredDev
    ? await prisma.card.findUnique({ where: { githubUsername: sprint.featuredDev }, select: FEATURED_CARD_SELECT })
    : null;
  const pack = activeEventPack(now);
  return {
    theme: sprintThemeById(sprint.theme),
    endsAt: sprint.endsAt,
    pack: { id: pack.id, name: pack.name, cost: pack.cost, visualTheme: pack.visualTheme },
    featuredDev: featuredCard,
    discountPercent: Math.round(FEATURED_DEV_DISCOUNT * 100),
  };
}

export type WeeklyEvent = Awaited<ReturnType<typeof getWeeklyEvent>>;
