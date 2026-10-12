/**
 * Recomputes every card with the current rarity/stat rules, from live GitHub data.
 *
 *   node --env-file=.env.local --import tsx scripts/recalculate-cards.ts           # dry run: report only
 *   node --env-file=.env.local --import tsx scripts/recalculate-cards.ts --apply   # write to the database
 *
 * Cards whose GitHub account no longer exists (or became an org) are left untouched.
 */
import { PrismaClient } from '@prisma/client';
import { fetchGitHubUserStats, toCardData } from '../src/lib/githubService';
import { RARITY_ORDER } from '../src/lib/rarity';

const apply = process.argv.includes('--apply');
const CONCURRENCY = 4;
const prisma = new PrismaClient();

async function main() {
  const cards = await prisma.card.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`${cards.length} cards — ${apply ? 'APPLYING' : 'dry run'}`);

  const transitions: Record<string, number> = {};
  const missing: string[] = [];
  let updated = 0;
  let next = 0;

  async function worker() {
    while (next < cards.length) {
      const card = cards[next++];
      const stats = await fetchGitHubUserStats(card.githubUsername);
      if (!stats) {
        missing.push(card.githubUsername);
        continue;
      }
      const key = `${card.rarity} → ${stats.rarity}`;
      transitions[key] = (transitions[key] ?? 0) + 1;
      if (apply) {
        await prisma.card.update({ where: { id: card.id }, data: toCardData(stats) });
        updated++;
      }
      if ((next % 50) === 0) console.log(`  ${next}/${cards.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log('\nRarity changes (old → new):');
  const rank = (r: string) => RARITY_ORDER.indexOf(r as never);
  for (const [key, n] of Object.entries(transitions).sort(([a], [b]) => {
    const [a1, a2] = a.split(' → '); const [b1, b2] = b.split(' → ');
    return rank(a1) - rank(b1) || rank(a2) - rank(b2);
  })) {
    console.log(`  ${key.padEnd(26)} ${n}`);
  }
  console.log(`\nAccounts not found (kept as they are): ${missing.length}${missing.length ? ` — ${missing.slice(0, 20).join(', ')}` : ''}`);
  if (apply) console.log(`Updated: ${updated}`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
