import { graphql } from './githubService';
import type { ContributionCounts } from './league';

/**
 * Dev League activity from GitHub: contributionsCollection over a time window,
 * 10 developers per GraphQL query (aliases). Counts follow GitHub's own rules
 * (commits on default branches, no forks); private work only shows in the
 * calendar days, which is how the league counts it.
 */

const BATCH = 10;

type Collection = {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  contributionCalendar: { weeks: { contributionDays: { contributionCount: number; date: string }[] }[] };
};

const FIELDS = 'totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions totalIssueContributions contributionCalendar { weeks { contributionDays { contributionCount date } } }';

/** A login GitHub no longer resolves (deleted or renamed): it scores 0 and leaves the market. */
const isMissingUser = (err: unknown) => /could not resolve to a user/i.test((err as Error)?.message ?? '');

export interface ContributionsResult {
  counts: Map<string, ContributionCounts>;
  /** Lower-cased logins GitHub doesn't know anymore. */
  missing: Set<string>;
}

async function batch(logins: string[], from: Date, to: Date): Promise<ContributionsResult> {
  const query = `query($from: DateTime!, $to: DateTime!) {\n${logins.map((l, i) =>
    `u${i}: user(login: ${JSON.stringify(l)}) { login contributionsCollection(from: $from, to: $to) { ${FIELDS} } }`).join('\n')}\n}`;
  const result: ContributionsResult = { counts: new Map(), missing: new Set() };
  let data: Record<string, { login: string; contributionsCollection: Collection } | null>;
  try {
    // GitHub's window is inclusive: stop a second before `to`
    data = await graphql(query, { from: from.toISOString(), to: new Date(to.getTime() - 1000).toISOString() });
  } catch (err) {
    if (logins.length === 1) {
      if (isMissingUser(err)) { result.missing.add(logins[0].toLowerCase()); return result; }
      throw err; // rate limit, network…: try again on the next run
    }
    // One missing account fails the whole query: retry one by one
    for (const login of logins) {
      const one = await batch([login], from, to);
      one.counts.forEach((v, k) => result.counts.set(k, v));
      one.missing.forEach(k => result.missing.add(k));
    }
    return result;
  }
  logins.forEach((login, i) => {
    const user = data[`u${i}`];
    if (!user) { result.missing.add(login.toLowerCase()); return; }
    const c = user.contributionsCollection;
    const days = c.contributionCalendar.weeks.flatMap(w => w.contributionDays).filter(d => {
      const day = new Date(`${d.date}T00:00:00Z`);
      return day >= from && day < to;
    });
    result.counts.set(login.toLowerCase(), {
      commits: c.totalCommitContributions,
      pullRequests: c.totalPullRequestContributions,
      reviews: c.totalPullRequestReviewContributions,
      issues: c.totalIssueContributions,
      activeDays: days.filter(d => d.contributionCount > 0).length,
    });
  });
  return result;
}

/**
 * Activity of each login between `from` and `to`. Stops early (returning what
 * it has) once `deadline` passes, so a cron run stays within its time.
 */
export async function fetchContributions(logins: string[], from: Date, to: Date, deadline = Infinity): Promise<ContributionsResult> {
  const out: ContributionsResult = { counts: new Map(), missing: new Set() };
  for (let i = 0; i < logins.length && Date.now() < deadline; i += BATCH) {
    const part = await batch(logins.slice(i, i + BATCH), from, to);
    part.counts.forEach((v, k) => out.counts.set(k, v));
    part.missing.forEach(k => out.missing.add(k));
  }
  return out;
}
