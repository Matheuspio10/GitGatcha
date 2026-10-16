/**
 * Concurrency tests: fires bursts of parallel requests at a running dev server
 * (purchase, pack opening, daily reward, challenge stakes) and checks that each
 * one-time action happens exactly once and that BITS add up.
 *
 * Talks to the real routes through HTTP, signed in as throwaway players it
 * creates in the DEV database (session cookies minted with NEXTAUTH_SECRET) and
 * deletes at the end. Refuses to run against anything but the Neon dev branch
 * and a local server.
 *
 *   npm run dev -- -p 3005                                     (another terminal)
 *   node --env-file=.env.local --import tsx scripts/concurrency-test.ts [http://localhost:3005]
 */
import { randomBytes } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { prisma } from '../src/lib/prisma';
import { addBits } from '../src/lib/bitsLedger';
import { ALL_PACKS } from '../src/lib/packDefinitions';
import { GIFT_DAILY_SEND_LIMIT, GIFT_MIN_LEVEL } from '../src/lib/gifts';
import { closeRound } from '../src/lib/leagueService';
import { LEAGUE_PARTICIPATION_BITS, leagueRewardFor } from '../src/lib/league';

const DEV_DB_HOST = 'ep-weathered-hill';
const BASE_URL = process.argv[2] ?? 'http://localhost:3005';
const RUN = randomBytes(3).toString('hex');

function guard() {
  const db = process.env.DATABASE_URL ?? '';
  if (!db.includes(DEV_DB_HOST)) throw new Error(`Refusing to run: DATABASE_URL is not the Neon dev branch (${DEV_DB_HOST}).`);
  const host = new URL(BASE_URL).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`Refusing to run against ${BASE_URL}: local servers only.`);
  if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET is missing (use --env-file=.env.local).');
}

// ---------------------------------------------------------------- players

interface Player { id: string; username: string; cookie: string }
const created: string[] = [];

async function makePlayer(label: string, bits: number): Promise<Player> {
  const username = `cc${RUN}${label}`;
  const email = `${username}@concurrency.test`;
  // Starts at 0 and gets its BITS through the ledger, so the history matches the balance
  const user = await prisma.user.create({
    data: { email, username, name: username, hasSetupProfile: true, currency: 0 },
    select: { id: true },
  });
  created.push(user.id);
  if (bits > 0) await addBits(user.id, bits, 'starting_bits');
  const token = await encode({
    token: { sub: user.id, email, name: username, username, hasSetupProfile: true },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return { id: user.id, username, cookie: `next-auth.session-token=${token}` };
}

/** Gives the player `n` cards that already exist in the game (any rarity). */
async function giveCards(player: Player, n: number, skip: number): Promise<string[]> {
  const cards = await prisma.card.findMany({ select: { id: true }, orderBy: { id: 'asc' }, skip, take: n });
  await prisma.userCard.createMany({ data: cards.map(c => ({ userId: player.id, cardId: c.id })) });
  return cards.map(c => c.id);
}

async function cleanup() {
  if (created.length === 0) return;
  await prisma.battle.deleteMany({ where: { OR: [{ challengerId: { in: created } }, { defenderId: { in: created } }] } });
  await prisma.userMission.deleteMany({ where: { userId: { in: created } } });
  await prisma.cardTrade.deleteMany({ where: { OR: [{ proposerId: { in: created } }, { receiverId: { in: created } }] } });
  await prisma.cardGift.deleteMany({ where: { OR: [{ senderId: { in: created } }, { receiverId: { in: created } }] } });
  await prisma.friendship.deleteMany({ where: { OR: [{ userId: { in: created } }, { friendId: { in: created } }] } });
  await prisma.userCard.deleteMany({ where: { userId: { in: created } } });
  await prisma.recentPull.deleteMany({ where: { userId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
}

// ---------------------------------------------------------------- requests

interface Res { status: number; body: Record<string, unknown> }

async function call(player: Player, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { cookie: player.cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

/** n requests released together. */
function burst(n: number, fn: (i: number) => Promise<Res>): Promise<Res[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
}

function summary(results: Res[]): string {
  const counts = new Map<string, number>();
  for (const r of results) {
    const key = `${r.status}${r.body.code ? ` ${r.body.code}` : ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, v]) => `${v}× ${k}`).join(', ');
}

// ---------------------------------------------------------------- checks

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function ledgerMatches(player: Player): Promise<{ ok: boolean; detail: string }> {
  const [user, sum] = await Promise.all([
    prisma.user.findUnique({ where: { id: player.id }, select: { currency: true } }),
    prisma.bitsTransaction.aggregate({ where: { userId: player.id }, _sum: { amount: true } }),
  ]);
  const history = sum._sum.amount ?? 0;
  return { ok: user?.currency === history, detail: `balance ${user?.currency}, history ${history}` };
}

async function inventoryCount(player: Player, packId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: player.id }, select: { inventory: true } });
  return (Array.isArray(user?.inventory) ? user.inventory : []).filter(i => (i as { packId?: string })?.packId === packId).length;
}

const ok200 = (r: Res) => r.status === 200 && r.body.success !== false;
const no500 = (results: Res[]) => results.every(r => r.status < 500 || r.status === 503);

// ---------------------------------------------------------------- tests

async function testPurchase() {
  console.log('\nPurchase: 10 parallel buys with BITS for exactly 3');
  const pack = ALL_PACKS.filter(p => p.cost > 0).sort((a, b) => a.cost - b.cost)[0];
  const player = await makePlayer('buy', pack.cost * 3 + pack.cost - 1);
  const results = await burst(10, () => call(player, 'POST', '/api/store/booster', { packId: pack.id }));
  console.log(`  ${pack.id} (${pack.cost} BITS): ${summary(results)}`);
  check('exactly 3 purchases succeed', results.filter(ok200).length === 3);
  check('the rest is "not enough BITS"', results.filter(r => !ok200(r)).every(r => r.body.code === 'common.notEnoughBits'));
  check('3 packs in the inventory', (await inventoryCount(player, pack.id)) === 3);
  const user = await prisma.user.findUnique({ where: { id: player.id }, select: { currency: true } });
  check('balance is what was left', user?.currency === pack.cost - 1, `balance ${user?.currency}`);
  const ledger = await ledgerMatches(player);
  check('BITS history matches the balance', ledger.ok, ledger.detail);
}

async function testOpen() {
  console.log('\nOpening: 5 parallel opens of the only pack in the inventory');
  const pack = ALL_PACKS.filter(p => p.cost > 0).sort((a, b) => a.cost - b.cost)[0];
  const player = await makePlayer('open', 0);
  await prisma.user.update({
    where: { id: player.id },
    data: { inventory: [{ packId: pack.id, packName: pack.name, acquiredAt: new Date().toISOString(), source: 'purchase' }] },
    select: { id: true },
  });
  const results = await burst(5, () => call(player, 'POST', '/api/inventory/open', { packId: pack.id }));
  console.log(`  ${summary(results)}`);
  const opened = results.filter(ok200);
  const left = await inventoryCount(player, pack.id);
  if (opened.length === 0 && results.some(r => r.status === 503)) {
    // GitHub/reserve could not draw: the pack must be back, never lost
    check('no card could be drawn, and the pack came back', left === 1, `${left} left`);
  } else {
    check('exactly 1 opening succeeds', opened.length === 1);
    check('the others are "pack not in inventory"', results.filter(r => !ok200(r)).every(r => r.body.code === 'inventory.packNotInInventory'));
    check('the inventory is empty', left === 0, `${left} left`);
    const cards = (opened[0]?.body.cards as unknown[] | undefined)?.length ?? 0;
    const owned = await prisma.userCard.aggregate({ where: { userId: player.id }, _sum: { quantity: true } });
    check('every drawn card is in the collection', (owned._sum.quantity ?? 0) === cards, `${cards} drawn, ${owned._sum.quantity ?? 0} owned`);
  }
  check('no server errors', no500(results));
}

async function testDaily() {
  console.log('\nDaily reward: 8 parallel claims');
  const player = await makePlayer('daily', 0);
  const results = await burst(8, () => call(player, 'POST', '/api/store/daily'));
  console.log(`  ${summary(results)}`);
  check('exactly 1 claim succeeds', results.filter(r => r.status === 200 && r.body.success === true).length === 1);
  check('the rest is "already claimed"', results.filter(r => r.body.success !== true).every(r => r.body.code === 'store.dailyAlreadyClaimed'));
  const user = await prisma.user.findUnique({ where: { id: player.id }, select: { loginStreak: true } });
  check('streak moved one day', user?.loginStreak === 1, `streak ${user?.loginStreak}`);
  const rewards = await prisma.bitsTransaction.count({ where: { userId: player.id, reason: 'daily_login' } });
  check('paid once', rewards === 1, `${rewards} payments`);
  const ledger = await ledgerMatches(player);
  check('BITS history matches the balance', ledger.ok, ledger.detail);
}

async function testChallengeCreation() {
  console.log('\nChallenge creation: 5 parallel open challenges with the same cards');
  const player = await makePlayer('chal', 150);
  const cardIds = await giveCards(player, 3, 0);
  const results = await burst(5, () => call(player, 'POST', '/api/battle/challenge', { open: true, cardIds, stake: 100 }));
  console.log(`  ${summary(results)}`);
  check('exactly 1 challenge is created', results.filter(ok200).length === 1);
  const pending = await prisma.battle.count({ where: { challengerId: player.id, status: 'PENDING' } });
  check('1 pending challenge in the database', pending === 1, `${pending} pending`);
  const user = await prisma.user.findUnique({ where: { id: player.id }, select: { currency: true } });
  check('the stake was taken once', user?.currency === 50, `balance ${user?.currency}`);
  const ledger = await ledgerMatches(player);
  check('BITS history matches the balance', ledger.ok, ledger.detail);
  check('no server errors', no500(results));
}

async function testChallengeAccept() {
  console.log('\nChallenge accept: 2 players × 3 parallel accepts of one open challenge');
  const [a, b, c] = await Promise.all([makePlayer('ca', 500), makePlayer('cb', 500), makePlayer('cc', 500)]);
  const [aCards, bCards, cCards] = await Promise.all([giveCards(a, 3, 3), giveCards(b, 3, 6), giveCards(c, 3, 9)]);
  const create = await call(a, 'POST', '/api/battle/challenge', { open: true, cardIds: aCards, stake: 100 });
  const battleId = (create.body.battle as { id?: string } | undefined)?.id ?? (create.body.battleId as string | undefined) ?? (create.body.id as string | undefined);
  check('challenge created', ok200(create) && !!battleId, `${create.status} ${JSON.stringify(create.body).slice(0, 120)}`);
  if (!battleId) return;

  const results = await burst(6, i => call(i % 2 ? c : b, 'POST', `/api/battle/challenge/${battleId}`, { cardIds: i % 2 ? cCards : bCards }));
  console.log(`  ${summary(results)}`);
  check('exactly 1 accept wins', results.filter(ok200).length === 1);
  check('the others are told someone accepted first', results.filter(r => !ok200(r)).every(r => r.body.code === 'challenge.alreadyAccepted'));
  const battle = await prisma.battle.findUnique({ where: { id: battleId }, select: { status: true, defenderId: true, winnerId: true } });
  check('the battle is completed once', battle?.status === 'COMPLETED', `status ${battle?.status}`);
  check('the defender is one of the two', battle?.defenderId === b.id || battle?.defenderId === c.id);

  // Stakes only move between the players: challenge_* rows of the three sum to zero
  const stakes = await prisma.bitsTransaction.aggregate({
    where: { userId: { in: [a.id, b.id, c.id] }, reason: { in: ['challenge_stake', 'challenge_payout', 'challenge_refund'] } },
    _sum: { amount: true },
  });
  check('stakes are conserved (no BITS created or lost)', (stakes._sum.amount ?? 0) === 0, `net ${stakes._sum.amount ?? 0}`);
  const outsider = battle?.defenderId === b.id ? c : b;
  const outsiderStakes = await prisma.bitsTransaction.count({ where: { userId: outsider.id, reason: 'challenge_stake' } });
  check('the player who lost the race paid nothing', outsiderStakes === 0, `${outsiderStakes} stake rows`);
  for (const p of [a, b, c]) {
    const ledger = await ledgerMatches(p);
    check(`BITS history matches the balance (${p.username.slice(-2)})`, ledger.ok, ledger.detail);
  }
  check('no server errors', no500(results));
}

/** Accepted friends, and every player at the level that may give cards. */
async function befriend(...players: Player[]) {
  await prisma.user.updateMany({ where: { id: { in: players.map(p => p.id) } }, data: { level: GIFT_MIN_LEVEL } });
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      await prisma.friendship.create({ data: { userId: players[i].id, friendId: players[j].id, status: 'ACCEPTED' } });
    }
  }
}

async function testGiftSameCard() {
  console.log('\nGift: 6 parallel gifts of the same card to 2 friends');
  const [a, b, c] = await Promise.all([makePlayer('ga', 1000), makePlayer('gb', 0), makePlayer('gc', 0)]);
  await befriend(a, b, c);
  const [cardId] = await giveCards(a, 1, 12);
  const results = await burst(6, i => call(a, 'POST', '/api/gifts', { cardId, toUsername: (i % 2 ? c : b).username }));
  console.log(`  ${summary(results)}`);
  check('exactly 1 gift goes through', results.filter(ok200).length === 1);
  check('the others are told the card is gone', results.filter(r => !ok200(r)).every(r => r.body.code === 'gifts.cardNotFound'));
  const owners = await prisma.userCard.findMany({ where: { cardId, userId: { in: [a.id, b.id, c.id] } }, select: { userId: true } });
  check('the card exists once, with a friend', owners.length === 1 && owners[0].userId !== a.id, JSON.stringify(owners));
  const fees = await prisma.bitsTransaction.count({ where: { userId: a.id, reason: 'card_gift' } });
  check('the fee is paid once', fees === 1, `${fees} fee rows`);
  const ledger = await ledgerMatches(a);
  check('BITS history matches the balance', ledger.ok, ledger.detail);
  check('no server errors', no500(results));
}

async function testGiftCross() {
  console.log(`\nGift: 2 friends giving each other 4 cards each at once (limit ${GIFT_DAILY_SEND_LIMIT}/day)`);
  const [a, b] = await Promise.all([makePlayer('xa', 5000), makePlayer('xb', 5000)]);
  await befriend(a, b);
  const [aCards, bCards] = await Promise.all([giveCards(a, 4, 13), giveCards(b, 4, 17)]);
  const results = await burst(8, i => (i % 2
    ? call(a, 'POST', '/api/gifts', { cardId: aCards[i >> 1], toUsername: b.username })
    : call(b, 'POST', '/api/gifts', { cardId: bCards[i >> 1], toUsername: a.username })));
  console.log(`  ${summary(results)}`);
  const sentA = await prisma.cardGift.count({ where: { senderId: a.id } });
  const sentB = await prisma.cardGift.count({ where: { senderId: b.id } });
  check(`each sends exactly ${GIFT_DAILY_SEND_LIMIT} (no deadlock, limit held)`, sentA === GIFT_DAILY_SEND_LIMIT && sentB === GIFT_DAILY_SEND_LIMIT, `a ${sentA}, b ${sentB}`);
  check('the rest hit a daily limit', results.filter(r => !ok200(r)).every(r => r.body.code === 'gifts.dailySendLimit' || r.body.code === 'gifts.dailyReceiveLimit'));
  const total = await prisma.userCard.count({ where: { userId: { in: [a.id, b.id] }, cardId: { in: [...aCards, ...bCards] } } });
  check('no card was lost or copied', total === 8, `${total} cards`);
  for (const p of [a, b]) {
    const ledger = await ledgerMatches(p);
    check(`BITS history matches the balance (${p.username.slice(-2)})`, ledger.ok, ledger.detail);
  }
  check('no server errors', no500(results));
}

async function propose(from: Player, to: Player, offered: string[], requested: string[]): Promise<string | undefined> {
  const res = await call(from, 'POST', '/api/trades', { toUsername: to.username, offered, requested });
  check('trade proposed', ok200(res), `${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
  return res.body.id as string | undefined;
}

const holder = async (cardId: string, players: Player[]) =>
  prisma.userCard.findMany({ where: { cardId, userId: { in: players.map(p => p.id) } }, select: { userId: true } });

async function testTradeAccept() {
  console.log('\nTrade: 6 parallel accepts of one proposal');
  const [a, b] = await Promise.all([makePlayer('ta', 3000), makePlayer('tb', 3000)]);
  await befriend(a, b);
  const [[x], [y]] = await Promise.all([giveCards(a, 1, 21), giveCards(b, 1, 22)]);
  const id = await propose(a, b, [x], [y]);
  if (!id) return;
  const results = await burst(6, () => call(b, 'POST', `/api/trades/${id}`, { action: 'accept' }));
  console.log(`  ${summary(results)}`);
  check('exactly 1 accept goes through', results.filter(ok200).length === 1);
  check('the others are told it was answered', results.filter(r => !ok200(r)).every(r => r.body.code === 'trades.notPending'));
  const [hx, hy] = await Promise.all([holder(x, [a, b]), holder(y, [a, b])]);
  check('the cards swapped once', hx.length === 1 && hx[0].userId === b.id && hy.length === 1 && hy[0].userId === a.id);
  const fees = await prisma.bitsTransaction.count({ where: { userId: { in: [a.id, b.id] }, reason: 'card_trade' } });
  check('each side paid its fee once', fees === 2, `${fees} fee rows`);
  for (const p of [a, b]) {
    const ledger = await ledgerMatches(p);
    check(`BITS history matches the balance (${p.username.slice(-2)})`, ledger.ok, ledger.detail);
  }
  check('no server errors', no500(results));
}

async function testTradeVersusGift() {
  console.log('\nTrade vs gift: accepting a trade while the proposer gives the same card away');
  const [a, b, c] = await Promise.all([makePlayer('va', 3000), makePlayer('vb', 3000), makePlayer('vc', 0)]);
  await befriend(a, b, c);
  const [[x], [y]] = await Promise.all([giveCards(a, 1, 23), giveCards(b, 1, 24)]);
  const id = await propose(a, b, [x], [y]);
  if (!id) return;
  const results = await burst(6, i => (i % 2
    ? call(b, 'POST', `/api/trades/${id}`, { action: 'accept' })
    : call(a, 'POST', '/api/gifts', { cardId: x, toUsername: c.username })));
  console.log(`  ${summary(results)}`);
  const [hx, hy] = await Promise.all([holder(x, [a, b, c]), holder(y, [a, b, c])]);
  check('the contested card exists once, away from the proposer', hx.length === 1 && hx[0].userId !== a.id, JSON.stringify(hx));
  const traded = hx[0]?.userId === b.id;
  check('the other card moved only if the trade won', hy.length === 1 && hy[0].userId === (traded ? a.id : b.id));
  check('exactly one of the two went through', results.filter(ok200).length === 1, summary(results));
  for (const p of [a, b, c]) {
    const ledger = await ledgerMatches(p);
    check(`BITS history matches the balance (${p.username.slice(-2)})`, ledger.ok, ledger.detail);
  }
  check('no server errors', no500(results));
}

async function testLeagueClose() {
  console.log('\nDev League: 4 parallel closes of one round');
  // A round long gone, so nothing else in the database is due with it
  const roundId = '2020-01-06';
  const startsAt = new Date(`${roundId}T00:00:00Z`);
  await prisma.leagueRound.deleteMany({ where: { id: roundId } });
  await prisma.leagueRound.create({ data: { id: roundId, startsAt, endsAt: new Date(startsAt.getTime() + 7 * 24 * 3600_000) } });
  try {
    const players = await Promise.all([makePlayer('la', 0), makePlayer('lb', 0), makePlayer('lc', 0)]);
    const points = [300, 120, 120]; // the last two tie for 2nd
    await prisma.leagueLineup.createMany({
      data: players.map((p, i) => ({ roundId, userId: p.id, cardIds: ['x1', 'x2', 'x3', 'x4', 'x5'], captainId: 'x1', cost: 10, points: points[i] })),
    });
    const results = await Promise.all([0, 1, 2, 3].map(() => closeRound(roundId, new Date())));
    check('exactly 1 close goes through', results.filter(Boolean).length === 1, JSON.stringify(results));
    const lineups = await prisma.leagueLineup.findMany({ where: { roundId }, select: { userId: true, position: true, rewardBits: true } });
    const pos = (p: Player) => lineups.find(l => l.userId === p.id)?.position;
    check('ranked with ties', pos(players[0]) === 1 && pos(players[1]) === 2 && pos(players[2]) === 2);
    for (const [i, p] of players.entries()) {
      const rows = await prisma.bitsTransaction.findMany({ where: { userId: p.id, reason: 'league_reward' }, select: { amount: true } });
      const expected = LEAGUE_PARTICIPATION_BITS + leagueRewardFor(i === 0 ? 1 : 2);
      check(`paid once, ${expected} BITS (${p.username.slice(-2)})`, rows.length === 1 && rows[0].amount === expected, JSON.stringify(rows));
      const ledger = await ledgerMatches(p);
      check(`BITS history matches the balance (${p.username.slice(-2)})`, ledger.ok, ledger.detail);
    }
  } finally {
    await prisma.leagueRound.deleteMany({ where: { id: roundId } });
  }
}

// ---------------------------------------------------------------- main

async function main() {
  guard();
  const ping = await fetch(BASE_URL + '/api/store/packs').catch(() => null);
  if (!ping?.ok) throw new Error(`No server answering at ${BASE_URL} (start it with npm run dev -- -p 3005).`);
  console.log(`Concurrency tests against ${BASE_URL} (run ${RUN})`);
  try {
    await testPurchase();
    await testOpen();
    await testDaily();
    await testChallengeCreation();
    await testChallengeAccept();
    await testGiftSameCard();
    await testGiftCross();
    await testTradeAccept();
    await testTradeVersusGift();
    await testLeagueClose();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  if (failures) process.exitCode = 1;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
