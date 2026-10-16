/**
 * Real numbers for the Cartola-style league plan (docs/liga-cartola.md):
 * draws developers that are cards in the game (a few per rarity), reads one
 * week of their GitHub activity (GraphQL contributionsCollection, 10 per
 * query) and scores it with the candidate formula below. Read-only: the
 * database is only read, GitHub only queried.
 *
 *   node --env-file=.env --env-file=.env.local --import tsx scripts/league-sample.ts [perRarity] [weekStart YYYY-MM-DD] [formWeeks]
 */
import { prisma } from '../src/lib/prisma';
import { graphql } from '../src/lib/githubService';
import { RARITY_ORDER } from '../src/lib/rarity';

const PER_RARITY = Number(process.argv[2] ?? 12);
// Default: the last full Monday–Sunday week (UTC)
const weekStart = (() => {
  if (process.argv[3]) return new Date(`${process.argv[3]}T00:00:00Z`);
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day - 7));
})();
const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600_000);
/** Weeks before the sampled one to show each active developer's form. */
const FORM_WEEKS = Number(process.argv[4] ?? 3);

/** Candidate scoring: points per unit and the weekly cap on the units that count. */
const RULES = {
  commits: { points: 1, cap: 40 },
  pullRequests: { points: 5, cap: 10 },
  reviews: { points: 3, cap: 10 },
  issues: { points: 2, cap: 10 },
  activeDays: { points: 3, cap: 7 },
} as const;
type Stat = keyof typeof RULES;

interface Week { commits: number; pullRequests: number; reviews: number; issues: number; activeDays: number; privateCount: number }

function score(w: Week): number {
  return (Object.keys(RULES) as Stat[]).reduce((sum, k) => sum + Math.min(w[k], RULES[k].cap) * RULES[k].points, 0);
}

type Collection = {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  restrictedContributionsCount: number;
  contributionCalendar: { weeks: { contributionDays: { contributionCount: number; date: string }[] }[] };
};

async function weekOf(logins: string[], from = weekStart): Promise<Map<string, Week>> {
  const to = new Date(from.getTime() + 7 * 24 * 3600_000);
  const fields = `totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions totalIssueContributions restrictedContributionsCount contributionCalendar { weeks { contributionDays { contributionCount date } } }`;
  const query = `query($from: DateTime!, $to: DateTime!) {\n${logins.map((l, i) =>
    `u${i}: user(login: ${JSON.stringify(l)}) { login contributionsCollection(from: $from, to: $to) { ${fields} } }`).join('\n')}\n}`;
  let data: Record<string, { login: string; contributionsCollection: Collection } | null>;
  try {
    data = await graphql(query, { from: from.toISOString(), to: new Date(to.getTime() - 1000).toISOString() });
  } catch (err) {
    // An account that no longer exists fails the whole query: fall back to one by one
    if (logins.length === 1) { console.error(`  skip ${logins[0]}: ${(err as Error).message}`); return new Map(); }
    const parts = await Promise.all(logins.map(l => weekOf([l], from)));
    return new Map(parts.flatMap(m => [...m]));
  }
  const out = new Map<string, Week>();
  for (const u of Object.values(data)) {
    if (!u) continue;
    const c = u.contributionsCollection;
    const days = c.contributionCalendar.weeks.flatMap(w => w.contributionDays)
      .filter(d => new Date(`${d.date}T00:00:00Z`) >= from && new Date(`${d.date}T00:00:00Z`) < to);
    out.set(u.login.toLowerCase(), {
      commits: c.totalCommitContributions,
      pullRequests: c.totalPullRequestContributions,
      reviews: c.totalPullRequestReviewContributions,
      issues: c.totalIssueContributions,
      activeDays: days.filter(d => d.contributionCount > 0).length,
      privateCount: c.restrictedContributionsCount,
    });
  }
  return out;
}

const pct = (n: number, d: number) => `${Math.round((n / Math.max(1, d)) * 100)}%`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function main() {
  console.log(`Week ${weekStart.toISOString().slice(0, 10)} → ${new Date(weekEnd.getTime() - 1).toISOString().slice(0, 10)} (UTC), ${PER_RARITY} cards per rarity\n`);
  const rows: { login: string; rarity: string; w: Week; pts: number }[] = [];
  for (const rarity of RARITY_ORDER) {
    const cards = await prisma.$queryRaw<{ githubUsername: string }[]>`
      SELECT "githubUsername" FROM "Card" WHERE "rarity" = ${rarity} ORDER BY random() LIMIT ${PER_RARITY}`;
    const logins = cards.map(c => c.githubUsername);
    for (let i = 0; i < logins.length; i += 10) {
      const weeks = await weekOf(logins.slice(i, i + 10));
      for (const login of logins.slice(i, i + 10)) {
        const w = weeks.get(login.toLowerCase());
        if (w) rows.push({ login, rarity, w, pts: score(w) });
      }
    }
  }

  console.log(`${'login'.padEnd(24)} ${'rarity'.padEnd(10)} commits  PRs  rev  iss  days  priv │ points`);
  for (const r of rows.sort((a, b) => b.pts - a.pts)) {
    const { w } = r;
    console.log(`${r.login.slice(0, 24).padEnd(24)} ${r.rarity.padEnd(10)} ${String(w.commits).padStart(7)} ${String(w.pullRequests).padStart(4)} ${String(w.reviews).padStart(4)} ${String(w.issues).padStart(4)} ${String(w.activeDays).padStart(5)} ${String(w.privateCount).padStart(5)} │ ${String(r.pts).padStart(6)}`);
  }

  console.log('\nBy rarity: devs, scored 0, median points, best');
  for (const rarity of RARITY_ORDER) {
    const rs = rows.filter(r => r.rarity === rarity);
    const pts = rs.map(r => r.pts);
    console.log(`  ${rarity.padEnd(10)} ${String(rs.length).padStart(3)}  ${pct(pts.filter(p => p === 0).length, rs.length).padStart(4)}  ${String(median(pts)).padStart(4)}  ${String(Math.max(0, ...pts)).padStart(4)}`);
  }
  // Form: the same developers over the previous weeks (is last week's score a good price signal?)
  const active = rows.filter(r => r.pts > 0).map(r => r.login);
  if (active.length && FORM_WEEKS > 0) {
    console.log(`
Form of the ${active.length} active developers over the ${FORM_WEEKS} weeks before:`);
    const history = new Map<string, number[]>(active.map(l => [l, []]));
    for (let k = FORM_WEEKS; k >= 1; k--) {
      const from = new Date(weekStart.getTime() - k * 7 * 24 * 3600_000);
      for (let i = 0; i < active.length; i += 10) {
        const weeks = await weekOf(active.slice(i, i + 10), from);
        for (const l of active.slice(i, i + 10)) history.get(l)!.push(weeks.get(l.toLowerCase()) ? score(weeks.get(l.toLowerCase())!) : 0);
      }
    }
    for (const r of rows.filter(x => x.pts > 0)) {
      const h = history.get(r.login)!;
      console.log(`  ${r.login.slice(0, 24).padEnd(24)} ${h.map(x => String(x).padStart(4)).join(' ')} → ${String(r.pts).padStart(4)}`);
    }
  }

  const all = rows.map(r => r.pts);
  console.log(`  ${'all'.padEnd(10)} ${String(rows.length).padStart(3)}  ${pct(all.filter(p => p === 0).length, rows.length).padStart(4)}  ${String(median(all)).padStart(4)}  ${String(Math.max(0, ...all)).padStart(4)}`);
  const capped = (k: Stat) => rows.filter(r => r.w[k] > RULES[k].cap).length;
  console.log(`\nHit the cap: commits ${capped('commits')}, PRs ${capped('pullRequests')}, reviews ${capped('reviews')}, issues ${capped('issues')}`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exitCode = 1; });
