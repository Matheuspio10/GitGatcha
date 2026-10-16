import { test } from 'node:test';
import assert from 'node:assert';
import {
  LEAGUE_BUDGET,
  LEAGUE_MAX_DEV_POINTS,
  LEAGUE_PRICE_MAX,
  LEAGUE_PRICE_MIN,
  currentAndNextRound,
  leagueRewardFor,
  lineupDevPoints,
  lineupError,
  lineupPoints,
  priceFromForm,
  roundIdOf,
  roundStartOf,
  scoreActivity,
} from './league';

const idle = { commits: 0, pullRequests: 0, reviews: 0, issues: 0, activeDays: 0 };

test('a round runs Monday 00:00 to Monday 00:00 UTC', () => {
  const sunday = new Date('2026-10-18T23:59:59Z');
  const monday = new Date('2026-10-19T00:00:00Z');
  assert.strictEqual(roundIdOf(roundStartOf(sunday)), '2026-10-12');
  assert.strictEqual(roundIdOf(roundStartOf(monday)), '2026-10-19');
  const { current, next } = currentAndNextRound(new Date('2026-10-15T12:00:00Z'));
  assert.strictEqual(roundIdOf(current), '2026-10-12');
  assert.strictEqual(roundIdOf(next), '2026-10-19');
});

test('scoring follows the table and its weekly caps', () => {
  assert.strictEqual(scoreActivity(idle), 0);
  // The plan's examples (docs/liga-cartola.md): sindresorhus 192 commits, 59 PRs, 3 issues, 7 days
  assert.strictEqual(scoreActivity({ commits: 192, pullRequests: 59, reviews: 0, issues: 3, activeDays: 7 }), 40 + 50 + 6 + 21);
  // Private-only weeks count through active days
  assert.strictEqual(scoreActivity({ ...idle, activeDays: 7 }), 21);
  assert.strictEqual(LEAGUE_MAX_DEV_POINTS, 161);
  // Over 3 weeks the caps are 3× (the form window)
  assert.strictEqual(scoreActivity({ ...idle, commits: 100 }, 3), 100);
});

test('prices follow the form, from the minimum to the maximum', () => {
  assert.strictEqual(priceFromForm(0), LEAGUE_PRICE_MIN);
  assert.strictEqual(priceFromForm(-5), LEAGUE_PRICE_MIN);
  assert.strictEqual(priceFromForm(56), 9); // schneems in the plan
  assert.strictEqual(priceFromForm(119), 17); // Dev-next-gen
  assert.strictEqual(priceFromForm(10_000), LEAGUE_PRICE_MAX);
  // The most expensive team of five fits twice the budget: picking means choosing
  assert.ok(LEAGUE_PRICE_MAX * 5 > LEAGUE_BUDGET && LEAGUE_PRICE_MIN * 5 <= LEAGUE_BUDGET);
});

test('a lineup has 5 different developers on the market, a captain among them and fits the budget', () => {
  const prices = new Map([['a', 17], ['b', 9], ['c', 9], ['d', 6], ['e', 5], ['f', 20], ['me', 2]]);
  const ok = { cardIds: ['a', 'b', 'c', 'd', 'e'], captainId: 'a' };
  assert.strictEqual(lineupError(ok, prices, null), null);
  assert.strictEqual(lineupError({ ...ok, cardIds: ['a', 'b', 'c', 'd'] }, prices, null), 'teamSize');
  assert.strictEqual(lineupError({ ...ok, cardIds: ['a', 'a', 'c', 'd', 'e'] }, prices, null), 'duplicate');
  assert.strictEqual(lineupError({ ...ok, cardIds: ['a', 'b', 'c', 'd', 'zz'] }, prices, null), 'notOnMarket');
  assert.strictEqual(lineupError({ cardIds: ['a', 'b', 'c', 'd', 'me'], captainId: 'a' }, prices, 'me'), 'self');
  assert.strictEqual(lineupError({ ...ok, captainId: 'f' }, prices, null), 'captain');
  assert.strictEqual(lineupError({ cardIds: ['a', 'b', 'c', 'f', 'e'], captainId: 'a' }, prices, null), 'budget');
});

test('the captain doubles and owning the card adds 10% (20% Shiny)', () => {
  assert.strictEqual(lineupDevPoints(100, false, 'none'), 100);
  assert.strictEqual(lineupDevPoints(100, true, 'none'), 200);
  assert.strictEqual(lineupDevPoints(100, false, 'owned'), 110);
  assert.strictEqual(lineupDevPoints(100, true, 'shiny'), 240);
  // The plan's example team: 96 (captain) + 100 + 45 + 28 + 21 = 386
  const devPoints = new Map([['a', 96], ['b', 100], ['c', 45], ['d', 28], ['e', 21]]);
  assert.strictEqual(lineupPoints({ cardIds: ['a', 'b', 'c', 'd', 'e'], captainId: 'a' }, devPoints, new Map()), 386);
});

test('prizes: the weekly Sprint table for the top 10, nothing after', () => {
  assert.strictEqual(leagueRewardFor(1), 1000);
  assert.strictEqual(leagueRewardFor(10), 150);
  assert.strictEqual(leagueRewardFor(11), 0);
  assert.strictEqual(leagueRewardFor(0), 0);
});
