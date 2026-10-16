/**
 * Runs the Dev League's daily maintenance by hand (the cron does it every day):
 * opens rounds, repeats lineups, closes and pays finished rounds, refreshes the
 * running round's points and prices the next market. Writes to the database
 * the env file points at.
 *
 *   node --env-file=.env --env-file=.env.local --import tsx scripts/league-maintain.ts [budgetSeconds] [now ISO]
 */
import { prisma } from '../src/lib/prisma';
import { maintainLeague } from '../src/lib/leagueService';

const budget = Number(process.argv[2] ?? 90) * 1000;
const now = process.argv[3] ? new Date(process.argv[3]) : new Date();

maintainLeague(budget, now)
  .then(report => console.log(`League maintenance at ${now.toISOString()}:`, report))
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
