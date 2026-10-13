/**
 * Rebuilds every player's rating from PvP history only (PvE used to overwrite it).
 *
 *   node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts           # dry run: report only
 *   node --env-file=.env.prod --import tsx scripts/recompute-ratings.ts --apply   # write to the database
 *
 * The replay knows nothing about ranked seasons (each season end resets ratings
 * halfway), so once a season has closed --apply refuses to run unless --force.
 */
import { PrismaClient } from '@prisma/client';
import { replayPvpRatings } from '../src/lib/ratings';
import { STARTING_RATING } from '../src/lib/battleConfig';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const prisma = new PrismaClient();

async function main() {
  const battles = await prisma.battle.findMany({
    where: { isRandom: false, status: 'COMPLETED' },
    select: { challengerId: true, defenderId: true, winnerId: true, status: true, isRandom: true, completedAt: true },
  });
  const ratings = replayPvpRatings(battles);
  const users = await prisma.user.findMany({ select: { id: true, username: true, rating: true } });

  console.log(`${battles.length} completed PvP battles — ${apply ? 'APPLYING' : 'dry run'}\n`);
  const rows = users
    .map(u => ({ ...u, next: ratings[u.id] ?? STARTING_RATING }))
    .sort((a, b) => b.next - a.next);
  for (const u of rows) {
    console.log(`  ${(u.username ?? u.id).padEnd(34)} ${String(u.rating).padStart(5)} → ${u.next}`);
  }

  const closedSeasons = await prisma.season.count({ where: { closedAt: { not: null } } });
  if (apply && closedSeasons > 0 && !force) {
    console.error(`\n${closedSeasons} season(s) already closed: this replay ignores the season resets and would undo them. Not applied (use --force if you really mean it).`);
    process.exitCode = 1;
    return;
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
