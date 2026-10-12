/**
 * Recomputes every card with the current rarity/stat rules, from live GitHub data.
 *
 *   node --env-file=.env.prod --import tsx scripts/recalculate-cards.ts           # dry run: report only
 *   node --env-file=.env.prod --import tsx scripts/recalculate-cards.ts --apply   # write to the database
 *   ... --only=login1,login2                                                       # just these cards
 *
 * Cards whose GitHub account no longer exists (deleted/renamed, or now an org) keep their
 * rarity but get the median stats of that rarity, so no orphan keeps stats from an old formula.
 * With --apply (full run) the booster reserve is also cleared, since it stores stats from draw time.
 */
import { PrismaClient } from '@prisma/client';
import { fetchGitHubUserStats, toCardData } from '../src/lib/githubService';
import { RARITY_ORDER } from '../src/lib/rarity';

const apply = process.argv.includes('--apply');
const only = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
const CONCURRENCY = 4;
const prisma = new PrismaClient();

async function main() {
  const cards = await prisma.card.findMany({
    where: only ? { githubUsername: { in: only } } : undefined,
    orderBy: { createdAt: 'asc' },
  });
  console.log(`${cards.length} cards — ${apply ? 'APPLYING' : 'dry run'}`);

  if (apply && !only) {
    // Reserved developers carry stats from draw time: drop them first so none can overwrite a recalculated card
    const { count } = await prisma.boosterReserve.deleteMany({});
    console.log(`Booster reserve cleared: ${count} rows (refills automatically)`);
  }

  const transitions: Record<string, number> = {};
  const missing: typeof cards = [];
  let updated = 0;
  let next = 0;

  async function worker() {
    while (next < cards.length) {
      const card = cards[next++];
      const stats = await fetchGitHubUserStats(card.githubUsername);
      if (!stats) {
        missing.push(card);
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
  if (apply) console.log(`Updated: ${updated}`);

  // Orphans: no GitHub data left to recompute from, so they take the median stats of their rarity
  if (missing.length) {
    console.log(`\nAccounts not found: ${missing.length} — ${missing.map(c => c.githubUsername).join(', ')}`);
    const missingIds = new Set(missing.map(c => c.id));
    const pool = (await prisma.card.findMany({ select: { id: true, rarity: true, atk: true, def: true, hp: true } }))
      .filter(c => !missingIds.has(c.id));
    const median = (xs: number[]) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    };
    for (const card of missing) {
      const peers = pool.filter(c => c.rarity === card.rarity);
      if (peers.length === 0) continue;
      const data = { atk: median(peers.map(c => c.atk)), def: median(peers.map(c => c.def)), hp: median(peers.map(c => c.hp)) };
      console.log(`  ${card.githubUsername} (${card.rarity}) ${card.atk}/${card.def}/${card.hp} → ${data.atk}/${data.def}/${data.hp}`);
      if (apply) await prisma.card.update({ where: { id: card.id }, data });
    }
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
