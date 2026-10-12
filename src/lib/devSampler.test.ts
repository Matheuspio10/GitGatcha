import { describe, test } from 'node:test';
import assert from 'node:assert';
import { baseQuery, chooseStrategy, DevSampler, PoolFilter, SamplerDeps } from './devSampler';
import type { DevStats, GitHubAccount } from './githubService';
import { averagePullRates, computeRarity, isInFollowerBand, Rarity, rarityForSlot } from './rarity';

// ─── A small fake GitHub ────────────────────────────────────────────────

interface FakeAccount extends GitHubAccount {
  language: string;
  location: string;
  deleted?: boolean;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.parse('2026-10-12T00:00:00Z');
const START = Date.parse('2008-01-01T00:00:00Z');

/** `total` ids; signup time grows with id; `timeOf` lets a test bunch accounts together. */
function makeWorld(total: number, seed: number, build: (id: number, rnd: () => number) => Partial<FakeAccount> = () => ({}),
  timeOf: (id: number) => number = id => START + Math.floor(((NOW - START) * id) / (total + 1))) {
  const rnd = mulberry32(seed);
  const accounts: FakeAccount[] = [];
  for (let id = 1; id <= total; id++) {
    accounts.push({
      id,
      login: `dev${id}`,
      type: rnd() < 0.05 ? 'Organization' : 'User',
      followers: Math.floor(Math.pow(rnd(), 4) * 3000),
      publicRepos: Math.floor(rnd() * 80),
      createdAt: new Date(timeOf(id)).toISOString(),
      language: ['Rust', 'Python', 'Go'][Math.floor(rnd() * 3)],
      location: rnd() < 0.5 ? 'Brazil' : 'Germany',
      deleted: rnd() < 0.03,
      ...build(id, rnd),
    });
  }
  return accounts;
}

function parseQuery(q: string) {
  const tokens = q.match(/(\w+):("[^"]*"|\S+)/g) ?? [];
  const langs: string[] = [];
  const locs: string[] = [];
  let reposMoreThan: number | undefined;
  let followers: [number, number] = [0, Infinity];
  let created: [number, number] = [-Infinity, Infinity];
  let createdCount = 0;
  for (const tok of tokens) {
    const [key, raw] = [tok.slice(0, tok.indexOf(':')), tok.slice(tok.indexOf(':') + 1).replace(/"/g, '')];
    if (key === 'language') langs.push(raw);
    if (key === 'location') locs.push(raw);
    if (key === 'repos') reposMoreThan = Number(raw.slice(2));
    if (key === 'followers') {
      if (raw.startsWith('>=')) followers = [Number(raw.slice(2)), Infinity];
      else { const [a, b] = raw.split('..').map(Number); followers = [a, b]; }
    }
    if (key === 'created') {
      createdCount++;
      if (raw.startsWith('>=')) created = [Date.parse(raw.slice(2)), Infinity];
      else if (raw.startsWith('<=')) created = [-Infinity, Date.parse(raw.slice(2))];
      else { const [a, b] = raw.split('..'); created = [Date.parse(a), Date.parse(b)]; }
    }
  }
  assert.ok(createdCount <= 1, `query has ${createdCount} created: qualifiers (GitHub would OR them): ${q}`);
  return (a: FakeAccount) => {
    if (a.deleted || a.type !== 'User') return false;
    if (langs.length && !langs.includes(a.language)) return false;
    if (locs.length && !locs.includes(a.location)) return false;
    if (reposMoreThan !== undefined && !(a.publicRepos > reposMoreThan)) return false;
    if (a.followers < followers[0] || a.followers > followers[1]) return false;
    const t = Date.parse(a.createdAt);
    return t >= created[0] && t <= created[1];
  };
}

function fakeDeps(world: FakeAccount[], seed: number, orgs: Record<string, string[]> = {}) {
  const rnd = mulberry32(seed);
  const byId = new Map(world.map(a => [a.id, a]));
  const byLogin = new Map(world.map(a => [a.login, a]));
  const maxId = world[world.length - 1].id;
  const memo = new Map<string, FakeAccount[]>();
  const calls = { search: 0, account: 0, after: 0 };
  const store = new Map<string, unknown>();

  const deps: SamplerDeps = {
    async search(query, page, perPage, order = 'asc') {
      calls.search++;
      const key = `${order} ${query}`;
      let hits = memo.get(key);
      if (!hits) {
        const match = parseQuery(query);
        hits = world.filter(match); // world is already in join order
        if (order === 'desc') hits = [...hits].reverse();
        memo.set(key, hits);
      }
      const start = (page - 1) * perPage;
      assert.ok(start < 1000, 'GitHub only serves the first 1000 results');
      const slice = hits.slice(start, Math.min(start + perPage, 1000));
      return { totalCount: hits.length, logins: slice.map(a => a.login), ids: slice.map(a => a.id) };
    },
    async accountById(id) {
      calls.account++;
      const a = byId.get(id);
      return a && !a.deleted ? a : null;
    },
    async firstAccountAfter(since) {
      calls.after++;
      // Like GitHub: only looks a short way ahead, so long runs of deleted ids answer "none"
      for (let id = since + 1; id <= Math.min(maxId, since + 40); id++) {
        const a = byId.get(id);
        if (a && !a.deleted) return { id: a.id, login: a.login };
      }
      return null;
    },
    async fetchStats(login): Promise<DevStats | null> {
      const a = byLogin.get(login);
      if (!a || a.deleted || a.type !== 'User') return null;
      return {
        githubUsername: a.login, avatarUrl: '', name: a.login, flavorText: '', atk: 10, def: 10, hp: 50,
        rarity: computeRarity(a.followers, 0).rarity, primaryLanguage: a.language, topLanguages: [a.language],
        followers: a.followers, totalStars: 0, starBonus: false, publicRepos: a.publicRepos,
      };
    },
    async orgMembers(list) {
      return list.flatMap(o => (orgs[o] ?? []).map(login => ({ login, followers: byLogin.get(login)!.followers })));
    },
    cache: {
      async get<T>(key: string) { return store.get(key) as T | undefined; },
      async set(key: string, value: unknown) { store.set(key, value); },
    },
    randomInt: (n: number) => Math.floor(rnd() * n),
    now: () => NOW,
  };
  return { deps, calls };
}

function eligible(world: FakeAccount[], filter: PoolFilter, rarity: Rarity) {
  const match = parseQuery(baseQuery(filter, rarity));
  return world.filter(a => {
    if (!match(a)) return false;
    const t = Date.parse(a.createdAt);
    if (filter.createdAfter && t < Date.parse(`${filter.createdAfter}T00:00:00Z`) + 86_400_000) return false;
    if (filter.createdBefore && t >= Date.parse(`${filter.createdBefore}T00:00:00Z`)) return false;
    return true;
  });
}

/** Draws `draws` candidates and checks every eligible dev came out, with a uniform spread (chi-square). */
async function assertUniform(world: FakeAccount[], filter: PoolFilter, rarity: Rarity, draws: number, seed: number, maxMissRate = 0.02, gridStep = 1500) {
  const pool = eligible(world, filter, rarity);
  const { deps } = fakeDeps(world, seed);
  const sampler = new DevSampler(deps, { gridStep });
  const strategy = chooseStrategy(filter, rarity);
  const counts = new Map(pool.map(a => [a.login, 0]));
  let misses = 0;

  for (let i = 0; i < draws; i++) {
    const login = await sampler.candidate(strategy, filter, rarity);
    if (!login) { misses++; continue; }
    assert.ok(counts.has(login), `${login} is not eligible for ${JSON.stringify(filter)} ${rarity}`);
    counts.set(login, counts.get(login)! + 1);
  }

  const got = draws - misses;
  const expected = got / pool.length;
  const neverDrawn = [...counts].filter(([, c]) => c === 0).map(([l]) => l);
  const chi2 = [...counts.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  const dof = pool.length - 1;

  assert.ok(misses / draws < maxMissRate, `too many failed draws: ${misses}/${draws}`);
  assert.deepStrictEqual(neverDrawn, [], 'some eligible developers can never be drawn');
  assert.ok(chi2 < dof + 6 * Math.sqrt(2 * dof), `distribution is not uniform (chi2=${chi2.toFixed(0)}, dof=${dof})`);
  return { pool, counts };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('DevSampler', () => {
  test('search strategy: every Rust Rare dev is equally likely (pool larger than the 1000-result cap)', async () => {
    const world = makeWorld(20_000, 1);
    const filter: PoolFilter = { languages: ['Rust'] };
    const pool = eligible(world, filter, 'Rare');
    assert.ok(pool.length > 1000, `pool must exceed the search cap (got ${pool.length})`);
    await assertUniform(world, filter, 'Rare', pool.length * 30, 2);
  });

  test('search strategy: small pools are drawn directly and uniformly', async () => {
    const world = makeWorld(3000, 3);
    await assertUniform(world, { locations: ['Brazil'] }, 'Epic', 6000, 4);
  });

  test('search strategy: a window holding more than 1000 devs still reaches all of them', async () => {
    // 1500 Common Go devs signed up within the same hour, in a world of 60k accounts
    const burst = Date.parse('2009-06-01T12:00:00Z');
    const world = makeWorld(60_000, 5,
      id => (id <= 1500 ? { language: 'Go', followers: 3, publicRepos: 5, deleted: false, type: 'User' } : { language: 'Python' }),
      id => (id <= 1500 ? burst + id * 1000 : burst + 3_600_000 + ((NOW - burst) * id) / 60_001));
    const pool = eligible(world, { languages: ['Go'] }, 'Common');
    assert.strictEqual(pool.length, 1500);
    // The pool sits in 1 of 4 windows, so some draws legitimately come back empty
    await assertUniform(world, { languages: ['Go'] }, 'Common', pool.length * 25, 6, 0.1);
  });

  test('devs in crowded windows are as likely as devs in sparse ones', async () => {
    // Two signup bursts make some windows hold well over 1000 devs, the rest are sparse
    const dense = (id: number) => (id > 2000 && id <= 3500) || (id > 25_000 && id <= 26_800);
    const world = makeWorld(40_000, 30, (id, rnd) =>
      dense(id) || rnd() < 0.03
        ? { language: 'Go', followers: 3, type: 'User', deleted: false }
        : { language: 'Python' });
    const pool = eligible(world, { languages: ['Go'] }, 'Common');
    await assertUniform(world, { languages: ['Go'] }, 'Common', pool.length * 20, 31, 0.02, 1500);
  });

  test('id strategy: any Common account can be drawn, including a brand-new tiny one', async () => {
    const world = makeWorld(4000, 7, id => (id === 3999 ? { login: 'the-player', followers: 0, publicRepos: 1, type: 'User', deleted: false } : {}));
    const { counts } = await assertUniform(world, {}, 'Common', 4000 * 25, 8);
    assert.ok(counts.get('the-player')! > 0);
  });

  test('id strategy respects created-date filters (New Blood)', async () => {
    const world = makeWorld(4000, 9);
    await assertUniform(world, { createdAfter: '2022-01-01' }, 'Common', 20_000, 10);
  });

  test('search strategy respects created-date filters (GitHub OGs)', async () => {
    const world = makeWorld(8000, 11);
    await assertUniform(world, { createdBefore: '2010-01-01' }, 'Rare', 8000, 12);
  });

  test('org strategy draws uniformly among members in the follower band', async () => {
    const world = makeWorld(500, 13, () => ({ type: 'User', deleted: false }));
    const members = world.slice(0, 300).map(a => a.login);
    const { deps } = fakeDeps(world, 14, { google: members.slice(0, 200), vercel: members.slice(150) });
    const sampler = new DevSampler(deps);
    const pool = new Set(world.slice(0, 300).filter(a => isInFollowerBand(a.followers, 'Common')).map(a => a.login));
    const seen = new Set<string>();
    for (let i = 0; i < pool.size * 20; i++) {
      const login = await sampler.candidate('org', { orgs: ['google', 'vercel'] }, 'Common');
      assert.ok(login && pool.has(login));
      seen.add(login);
    }
    assert.strictEqual(seen.size, pool.size);
  });

  test('accounts without public repositories never drop (every strategy)', async () => {
    // A third of the accounts are empty; none of them may come out
    const world = makeWorld(8000, 32, (id, rnd) => (rnd() < 0.33 ? { publicRepos: 0 } : {}));
    const { deps } = fakeDeps(world, 33);
    const sampler = new DevSampler(deps, { gridStep: 1500 });
    const empty = new Set(world.filter(a => a.publicRepos === 0).map(a => a.login));
    for (const [filter, rarity] of [[{}, 'Common'], [{ languages: ['Rust'] }, 'Rare'], [{ locations: ['Brazil'] }, 'Epic']] as [PoolFilter, Rarity][]) {
      for (let i = 0; i < 300; i++) {
        const dev = await sampler.drawDev(filter, rarity);
        if (dev) assert.ok(!empty.has(dev.githubUsername), `${dev.githubUsername} has no public repos`);
      }
    }
  });

  test('drawDev skips excluded developers', async () => {
    const world = makeWorld(3000, 15);
    const { deps } = fakeDeps(world, 16);
    const sampler = new DevSampler(deps);
    const pool = eligible(world, { locations: ['Germany'] }, 'Epic');
    const exclude = new Set(pool.slice(1).map(a => a.login.toLowerCase()));
    for (let i = 0; i < 20; i++) {
      const dev = await sampler.drawDev({ locations: ['Germany'] }, 'Epic', exclude);
      if (dev) assert.strictEqual(dev.githubUsername, pool[0].login);
    }
  });

  test('maxId is an upper bound that never cuts off the newest account', async () => {
    const world = makeWorld(5000, 17, id => (id === 5000 ? { deleted: false, type: 'User' } : {}));
    const { deps } = fakeDeps(world, 18);
    const bound = await new DevSampler(deps).maxId();
    assert.ok(bound >= 5000 && bound <= 5100, `bound ${bound}`);
  });

  test('the id → signup-time curve is monotone, even across deleted stretches', async () => {
    const world = makeWorld(20_000, 26, id => (id >= 6000 && id <= 9500 ? { deleted: true } : {}));
    const { deps } = fakeDeps(world, 27);
    const sampler = new DevSampler(deps, { gridStep: 1000 });
    let prev = -Infinity;
    for (let id = 1; id <= 20_100; id += 7) {
      const t = await sampler.timeAtId(id);
      assert.ok(t >= prev, `time goes backwards at id ${id}`);
      prev = t;
    }
  });

  test('long runs of deleted ids neither hide accounts nor break the windows', async () => {
    // ids 6000-9500 were all deleted: several whole curve segments have no account at all
    const world = makeWorld(20_000, 23, id => (id >= 6000 && id <= 9500 ? { deleted: true } : {}));
    await assertUniform(world, { languages: ['Rust'] }, 'Rare', 1500 * 25, 24, 0.02, 1000);
    await assertUniform(world, { createdBefore: '2016-01-01' }, 'Common', 20_000, 25, 0.02, 1000);
  });

  test('a single coarse curve segment still gives uniform windows', async () => {
    const world = makeWorld(20_000, 19);
    await assertUniform(world, { languages: ['Python'] }, 'Rare', 1500 * 25, 20, 0.02, 500_000);
  });
});

describe('strategy and query building', () => {
  test('chooseStrategy', () => {
    assert.strictEqual(chooseStrategy({ orgs: ['google'] }, 'Epic'), 'org');
    assert.strictEqual(chooseStrategy({}, 'Common'), 'id');
    assert.strictEqual(chooseStrategy({ createdAfter: '2022-01-01' }, 'Common'), 'id');
    assert.strictEqual(chooseStrategy({ reposMoreThan: 50 }, 'Common'), 'search');
    assert.strictEqual(chooseStrategy({ languages: ['Rust'] }, 'Common'), 'search');
    assert.strictEqual(chooseStrategy({}, 'Legendary'), 'search');
  });

  test('once window sizes are cached, a draw costs about one search', async () => {
    const world = makeWorld(20_000, 28);
    const { deps, calls } = fakeDeps(world, 29);
    const sampler = new DevSampler(deps, { gridStep: 1500 });
    for (let i = 0; i < 400; i++) await sampler.candidate('search', { languages: ['Rust'] }, 'Rare'); // warm up
    const before = calls.search;
    for (let i = 0; i < 200; i++) await sampler.candidate('search', { languages: ['Rust'] }, 'Rare');
    const perDraw = (calls.search - before) / 200;
    assert.ok(perDraw < 1.3, `${perDraw.toFixed(2)} searches per draw`);
  });

  test('the pool size is counted once, not on every draw (stable cache key)', async () => {
    const world = makeWorld(20_000, 21);
    const { deps } = fakeDeps(world, 22);
    let clock = NOW;
    deps.now = () => (clock += 60_000); // the clock moves between draws, as in production
    const search = deps.search;
    let poolCounts = 0;
    deps.search = (q, page, perPage) => {
      if (perPage === 1 && !q.includes('created:')) poolCounts++;
      return search(q, page, perPage);
    };
    const sampler = new DevSampler(deps);
    for (let i = 0; i < 6; i++) await sampler.candidate('search', { languages: ['Rust'] }, 'Rare');
    assert.strictEqual(poolCounts, 1);
  });

  test('baseQuery quotes multi-word locations and never adds created:', () => {
    const q = baseQuery({ locations: ['Brazil', 'São+Paulo'], languages: ['C++'], reposMoreThan: 10 }, 'Rare');
    assert.strictEqual(q, 'type:user language:C++ location:Brazil location:"São Paulo" repos:>10 followers:200..999');
    assert.ok(!baseQuery({ createdBefore: '2010-01-01' }, 'Legendary').includes('created:'));
  });
});

describe('booster slot odds', () => {
  test('each slot follows its odds and the averages add up', () => {
    assert.strictEqual(rarityForSlot(0, 0.99), 'Common');
    assert.strictEqual(rarityForSlot(2, 0.69), 'Common');
    assert.strictEqual(rarityForSlot(2, 0.71), 'Uncommon');
    assert.strictEqual(rarityForSlot(4, 0.10), 'Rare');
    assert.strictEqual(rarityForSlot(4, 0.90), 'Legendary');
    assert.strictEqual(rarityForSlot(9, 0.90), 'Legendary'); // longer packs repeat the last slot
    const rates = averagePullRates();
    const sum = Object.values(rates).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(Math.abs(rates.Legendary - 0.03) < 1e-9);
  });
});

describe('rarity', () => {
  test('follower bands and star bonus', () => {
    assert.deepStrictEqual(computeRarity(0, 0), { baseRarity: 'Common', rarity: 'Common', starBonus: false });
    assert.deepStrictEqual(computeRarity(49, 999), { baseRarity: 'Common', rarity: 'Common', starBonus: false });
    assert.deepStrictEqual(computeRarity(30, 1000), { baseRarity: 'Common', rarity: 'Uncommon', starBonus: true });
    assert.strictEqual(computeRarity(200, 0).rarity, 'Rare');
    assert.strictEqual(computeRarity(4999, 30_000).rarity, 'Legendary');
    assert.deepStrictEqual(computeRarity(10_000, 1_000_000), { baseRarity: 'Legendary', rarity: 'Legendary', starBonus: false });
  });
});
