/**
 * Rebuilds every player's rating from PvP history only (PvE used to overwrite it).
 *
 *   node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts           # dry run: report only
 *   node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts --apply   # write to the database
 *
 * The replay follows today's rules: placement K for each player's first battles
 * of a season and the halfway reset when each closed season was closed. Battles
 * played before a rule existed are replayed with it too, so read the dry run
 * before applying.
 */
import { PrismaClient } from '@prisma/client';
import { replayPvpRatings } from '../src/lib/ratings';
import { STARTING_RATING } from '../src/lib/battleConfig';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const battles = await prisma.battle.findMany({
    where: { isRandom: false, status: 'COMPLETED' },
    select: { challengerId: true, defenderId: true, winnerId: true, status: true, isRandom: true, completedAt: true },
  });
  const closed = await prisma.season.findMany({ where: { closedAt: { not: null } }, select: { closedAt: true } });
  const ratings = replayPvpRatings(battles, { seasonResets: closed.map(s => s.closedAt as Date) });
  const users = await prisma.user.findMany({ select: { id: true, username: true, rating: true } });

  console.log(`${battles.length} completed PvP battles, ${closed.length} closed season(s) — ${apply ? 'APPLYING' : 'dry run'}\n`);
  const rows = users
    .map(u => ({ ...u, next: ratings[u.id] ?? STARTING_RATING }))
    .sort((a, b) => b.next - a.next);
  for (const u of rows) {
    console.log(`  ${(u.username ?? u.id).padEnd(34)} ${String(u.rating).padStart(5)} → ${u.next}`);
  }

  if (apply) {
    await prisma.$transaction(rows.filter(u => u.rating !== u.next).map(u =>
      prisma.user.update({ where: { id: u.id }, data: { rating: u.next } })));
    console.log('\nRatings updated.');
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
