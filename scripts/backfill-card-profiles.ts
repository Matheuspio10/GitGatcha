/**
 * Fills the GitHub profile snapshot of existing cards (followers, stars, forks, top repo,
 * repos, gists, languages, account creation date), which names the card title.
 * Only those columns are written: ATK / DEF / HP and rarity stay as they are.
 *
 *   node --env-file=.env.prod --import tsx scripts/backfill-card-profiles.ts             # dry run: title preview
 *   node --env-file=.env.prod --import tsx scripts/backfill-card-profiles.ts --apply     # write to the database
 *   ... --all            # also refresh cards that already have a snapshot
 *   ... --limit=100      # only the first N cards
 *   ... --only=a,b       # just these logins
 *
 * Costs 2–4 GitHub REST calls per card (user + up to 3 repo pages).
 */
import { PrismaClient } from '@prisma/client';
import { fetchGitHubUserStats, toCardProfile } from '../src/lib/githubService';
import { cardTitle } from '../src/lib/cardVisuals';

const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');
const only = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.slice('--limit='.length)) || undefined;
const CONCURRENCY = 4;
const prisma = new PrismaClient();

async function main() {
  const cards = await prisma.card.findMany({
    where: {
      ...(only ? { githubUsername: { in: only } } : {}),
      ...(all || only ? {} : { profileUpdatedAt: null }),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  console.log(`${cards.length} cards — ${apply ? 'APPLYING' : 'dry run'}`);

  const titles: Record<string, number> = {};
  const samples: string[] = [];
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
      const profile = toCardProfile(stats);
      const { title, reason } = cardTitle(profile, card.primaryLanguage, card.rarity, card.githubUsername);
      titles[title] = (titles[title] ?? 0) + 1;
      if (samples.length < 40) samples.push(`  ${card.githubUsername.padEnd(24)} ${card.rarity.padEnd(10)} ${title}${reason ? ` (${reason})` : ''}`);
      if (apply) {
        await prisma.card.update({ where: { id: card.id }, data: profile });
        updated++;
      }
      if (next % 50 === 0) console.log(`  ${next}/${cards.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log('\nSample:');
  console.log(samples.join('\n'));
  console.log('\nTitles:');
  for (const [title, n] of Object.entries(titles).sort((a, b) => b[1] - a[1])) console.log(`  ${title.padEnd(20)} ${n}`);
  if (missing.length) console.log(`\nAccounts not found (title stays language + rank): ${missing.length} — ${missing.join(', ')}`);
  if (apply) console.log(`\nUpdated: ${updated}`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
