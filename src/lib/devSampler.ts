/**
 * Uniform random sampling of GitHub developers for boosters.
 *
 * Goal: every developer that matches a booster's filter and a rarity band has
 * the same chance of being drawn — including tiny accounts like the player's
 * own. Three strategies, picked per (filter, rarity):
 *
 * 1. `org`    — Big Tech style pools: public members of a list of orgs, kept in
 *               the DB; uniform pick among members in the follower band.
 * 2. `id`     — huge pools that can be checked from the account object alone
 *               (e.g. Common devs of the generic booster): draw a uniformly random
 *               account id and accept it if it matches (rejection sampling).
 * 3. `search` — everything else, through the GitHub user search. A search only
 *               returns its first 1000 results, so the pool is split into windows
 *               of account-creation time built from equal *id* blocks (ids grow with
 *               signup time). A window is picked uniformly, then a slot j in
 *               [0, 1000); the dev at position j is accepted only if the window
 *               actually has more than j devs. Each dev therefore has probability
 *               1 / (blocks × 1000): uniform. A window that overflows 1000 is
 *               bisected by time to reach any position.
 *
 * All GitHub/DB access goes through `SamplerDeps`, so the logic is unit-tested
 * with a fake GitHub (see devSampler.test.ts).
 */
import type { DevStats, GitHubAccount, SearchUsersPage } from './githubService';
import { followerBandQualifier, isInFollowerBand, Rarity } from './rarity';

export interface PoolFilter {
  /** Any of these languages (GitHub ORs repeated qualifiers). Also enforced as a top-3 language of the dev. */
  languages?: string[];
  /** Any of these profile locations. */
  locations?: string[];
  /** Account created strictly after this date (YYYY-MM-DD). */
  createdAfter?: string;
  /** Account created strictly before this date (YYYY-MM-DD). */
  createdBefore?: string;
  /** More than N public repositories. */
  reposMoreThan?: number;
  /** Public members of these GitHub organizations. */
  orgs?: string[];
}

export interface OrgMember {
  login: string;
  followers: number;
}

export interface SamplerCache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface SamplerDeps {
  search(query: string, page: number, perPage: number, order?: 'asc' | 'desc'): Promise<SearchUsersPage>;
  accountById(id: number): Promise<GitHubAccount | null>;
  /** Next account after `sinceId`; may be `null` inside a long run of deleted ids. */
  firstAccountAfter(sinceId: number): Promise<{ id: number; login: string } | null>;
  fetchStats(login: string): Promise<DevStats | null>;
  orgMembers(orgs: string[]): Promise<OrgMember[]>;
  cache: SamplerCache;
  /** Uniform integer in [0, n). */
  randomInt(n: number): number;
  now(): number;
}

export type SamplerStrategy = 'org' | 'id' | 'search';

interface CurvePoint {
  id: number;
  t: number;
}

/**
 * Boosters draw developers, not empty accounts: at least this many public
 * repositories, on top of any pack filter. Uniform among everyone who qualifies.
 */
export const MIN_PUBLIC_REPOS = 1;

/** Effective "more than N public repos" for a filter (pack rule or the global minimum). */
function minReposExclusive(filter: PoolFilter): number {
  return Math.max(filter.reposMoreThan ?? 0, MIN_PUBLIC_REPOS - 1);
}

const SEARCH_RESULT_CAP = 1000;   // GitHub search never returns past result #1000
const PER_PAGE = 100;
const TARGET_PER_WINDOW = 400;    // average devs per window → ~40% acceptance per search call
const MAX_SEARCH_TRIES = 12;      // search calls per candidate before giving up
const MAX_WINDOW_DRAWS = 200;     // window draws per candidate (most rejections are free once window sizes are cached)
const MAX_ID_TRIES = 40;          // account lookups per candidate before giving up
const MAX_CANDIDATES = 4;         // candidates per card (rejected for exclusion/band drift/language)
const ID_STRATEGY_MAX_REPOS = 10; // above this, "repos:>N" pools are too sparse for id sampling

const DAY = 86_400;
const COUNT_TTL = 7 * DAY;
const RECENT_COUNT_TTL = 3600;
const MAX_ID_TTL = 6 * 3600;
const MAX_ID_MARGIN = 0.01;       // headroom over the newest user found (ids keep growing while cached)
const ANCHOR_PROBES = 12;         // forward probes to step over runs of deleted ids
const FOREVER = 10 * 365 * DAY;   // creation dates never change
const GITHUB_EPOCH = Date.parse('2007-10-01T00:00:00Z');
const GRID_STEP = 500_000;        // ids between points of the global signup curve (~700 points in 2026)

// ─── Strategy selection ─────────────────────────────────────────────────

export function chooseStrategy(filter: PoolFilter, rarity: Rarity): SamplerStrategy {
  if (filter.orgs?.length) return 'org';
  if (
    rarity === 'Common' &&
    !filter.languages?.length &&
    !filter.locations?.length &&
    minReposExclusive(filter) <= ID_STRATEGY_MAX_REPOS
  ) {
    return 'id';
  }
  return 'search';
}

// ─── Query building ─────────────────────────────────────────────────────

function quoteValue(value: string): string {
  const clean = value.replace(/"/g, '').trim();
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

/** Search qualifiers for the filter + band, without any `created:` (windows add their own). */
export function baseQuery(filter: PoolFilter, rarity: Rarity): string {
  const parts = ['type:user'];
  for (const lang of filter.languages ?? []) parts.push(`language:${quoteValue(lang)}`);
  // Locations may be written URL-style ('São+Paulo')
  for (const loc of filter.locations ?? []) parts.push(`location:${quoteValue(loc.replace(/\+/g, ' '))}`);
  parts.push(`repos:>${minReposExclusive(filter)}`);
  parts.push(followerBandQualifier(rarity));
  return parts.join(' ');
}

function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Inclusive time range → `created:` qualifier. GitHub ORs repeated qualifiers, so there must be only one. */
export function createdQualifier(fromMs: number, toMs: number): string {
  return `created:${isoSeconds(fromMs)}..${isoSeconds(toMs)}`;
}

/** `created:` for the whole pool, built only from the filter's fixed dates so the cached count key stays stable. */
function rootCreatedQualifier(filter: PoolFilter, fromMs: number, toMs: number): string {
  if (filter.createdAfter && filter.createdBefore) return createdQualifier(fromMs, toMs);
  if (filter.createdAfter) return `created:>=${isoSeconds(fromMs)}`;
  if (filter.createdBefore) return `created:<=${isoSeconds(toMs)}`;
  return '';
}

/** Inclusive [from, to] (ms) allowed by the filter's created dates. */
function filterTimeRange(filter: PoolFilter, nowMs: number): [number, number] {
  const from = filter.createdAfter ? Date.parse(`${filter.createdAfter}T00:00:00Z`) + DAY * 1000 : GITHUB_EPOCH;
  const to = filter.createdBefore ? Date.parse(`${filter.createdBefore}T00:00:00Z`) - 1000 : nowMs;
  return [from, Math.min(to, nowMs)];
}

function matchesAccount(filter: PoolFilter, rarity: Rarity, account: GitHubAccount, nowMs: number): boolean {
  if (account.type !== 'User') return false;
  if (!isInFollowerBand(account.followers, rarity)) return false;
  if (!(account.publicRepos > minReposExclusive(filter))) return false;
  const created = Date.parse(account.createdAt);
  const [from, to] = filterTimeRange(filter, nowMs);
  return created >= from && created <= to;
}

// ─── Sampler ────────────────────────────────────────────────────────────

export class DevSampler {
  private gridStep: number;

  constructor(private deps: SamplerDeps, opts: { gridStep?: number } = {}) {
    this.gridStep = opts.gridStep ?? GRID_STEP;
  }

  /**
   * Draws one developer of `rarity` (follower band) matching `filter`, skipping
   * `exclude` (lower-cased logins). Returns `null` when GitHub can't provide one
   * within the call budget; the caller decides the fallback.
   */
  async drawDev(filter: PoolFilter, rarity: Rarity, exclude: Set<string> = new Set()): Promise<DevStats | null> {
    const strategy = chooseStrategy(filter, rarity);
    const requiredLangs = (filter.languages ?? []).map(l => l.toLowerCase());

    for (let attempt = 0; attempt < MAX_CANDIDATES; attempt++) {
      const login = await this.candidate(strategy, filter, rarity);
      if (!login) return null; // pool empty or budget spent
      if (exclude.has(login.toLowerCase())) continue;

      const stats = await this.deps.fetchStats(login);
      if (!stats) continue;
      // The search index can lag behind the live profile; keep the band exact.
      if (!isInFollowerBand(stats.followers, rarity)) continue;
      if (stats.publicRepos !== undefined && !(stats.publicRepos > minReposExclusive(filter))) continue;
      if (requiredLangs.length > 0) {
        const top = (stats.topLanguages.length ? stats.topLanguages : [stats.primaryLanguage]).map(l => l.toLowerCase());
        if (!requiredLangs.some(l => top.includes(l))) continue;
      }
      return stats;
    }
    return null;
  }

  /** One uniformly drawn login, before stats-level checks. */
  async candidate(strategy: SamplerStrategy, filter: PoolFilter, rarity: Rarity): Promise<string | null> {
    if (strategy === 'org') return this.candidateFromOrgs(filter, rarity);
    if (strategy === 'id') return this.candidateById(filter, rarity);
    return this.candidateBySearch(filter, rarity);
  }

  // ── org pools ──

  private async candidateFromOrgs(filter: PoolFilter, rarity: Rarity): Promise<string | null> {
    const members = await this.deps.orgMembers(filter.orgs ?? []);
    const seen = new Set<string>();
    const pool = members.filter(m => {
      const key = m.login.toLowerCase();
      if (seen.has(key) || !isInFollowerBand(m.followers, rarity)) return false;
      seen.add(key);
      return true;
    });
    return pool.length > 0 ? pool[this.deps.randomInt(pool.length)].login : null;
  }

  // ── id sampling ──

  private async candidateById(filter: PoolFilter, rarity: Rarity): Promise<string | null> {
    const [idLo, idHi] = await this.idRange(filter);
    if (idHi < idLo) return null;
    const nowMs = this.deps.now();
    for (let i = 0; i < MAX_ID_TRIES; i++) {
      const id = idLo + this.deps.randomInt(idHi - idLo + 1);
      const account = await this.deps.accountById(id);
      if (account && matchesAccount(filter, rarity, account, nowMs)) return account.login;
    }
    return null;
  }

  // ── search windows ──

  private async candidateBySearch(filter: PoolFilter, rarity: Rarity): Promise<string | null> {
    const base = baseQuery(filter, rarity);
    const [fromMs, toMs] = filterTimeRange(filter, this.deps.now());
    if (toMs < fromMs) return null;

    const rootQuery = [base, rootCreatedQualifier(filter, fromMs, toMs)].filter(Boolean).join(' ');
    let total = await this.count(rootQuery);
    if (total === 0) return null;

    if (total <= SEARCH_RESULT_CAP) {
      // Small pool: uniform index over all of it. Its size is re-checked hourly while the
      // pool is still open to new signups, so newcomers aren't left past a stale total.
      if (this.countTtl(toMs) !== COUNT_TTL) total = await this.count(rootQuery, true, RECENT_COUNT_TTL, 'recent');
      for (let tries = 0; tries < 3 && total > 0; tries++) {
        const login = await this.pickNth(base, fromMs, toMs, this.deps.randomInt(total), total);
        if (login) return login;
        total = await this.count(rootQuery, false); // cached count was stale
      }
      return null;
    }

    const [idLo, idHi] = await this.idRange(filter);
    // Blocks sit on a fixed id grid (a power-of-two multiple or fraction of the curve
    // step), so the same windows come back on every draw and their sizes can be cached.
    const rawSize = ((idHi - idLo + 1) * TARGET_PER_WINDOW) / total;
    const blockSize = Math.max(1, Math.round(this.gridStep * 2 ** Math.round(Math.log2(rawSize / this.gridStep))));
    const firstBlock = Math.floor((idLo - 1) / blockSize);
    const blocks = Math.floor((idHi - 1) / blockSize) - firstBlock + 1;

    // Rejection bound: j is drawn in [0, bound) where bound >= every window's size, so each
    // dev has probability 1 / (blocks × bound) whatever the size of its window. Starts at the
    // search cap and grows (cached per pool) when a denser window shows up.
    const boundKey = `bound:${base}:${idLo}-${idHi}:${blockSize}`;
    let bound = Math.max(SEARCH_RESULT_CAP, (await this.deps.cache.get<number>(boundKey)) ?? 0);
    const raiseBound = async (size: number) => {
      bound = Math.ceil(size / SEARCH_RESULT_CAP) * SEARCH_RESULT_CAP;
      await this.deps.cache.set(boundKey, bound, COUNT_TTL);
    };

    for (let draws = 0, searches = 0; draws < MAX_WINDOW_DRAWS && searches < MAX_SEARCH_TRIES; draws++) {
      const b = firstBlock + this.deps.randomInt(blocks);
      const startId = Math.max(idLo, b * blockSize + 1);
      const endId = Math.min(idHi, (b + 1) * blockSize);

      // Window = signup-time span of this id block (first/last block open to the pool's ends)
      const winFrom = startId <= idLo ? fromMs : Math.max(fromMs, await this.timeAtId(startId));
      const winTo = endId >= idHi ? toMs : Math.min(toMs, (await this.timeAtId(endId + 1)) - 1000);
      if (winTo < winFrom) continue;

      const query = `${base} ${createdQualifier(winFrom, winTo)}`;
      const j = this.deps.randomInt(bound);
      let size = await this.deps.cache.get<number>(`count:${query}`);

      if (size === undefined) {
        searches++;
        if (j < SEARCH_RESULT_CAP) {
          // Learn the window size and fetch the candidate's page in the same call
          const page = await this.deps.search(query, Math.floor(j / PER_PAGE) + 1, PER_PAGE);
          size = page.totalCount;
          await this.deps.cache.set(`count:${query}`, size, this.countTtl(winTo));
          if (size > bound) { await raiseBound(size); continue; } // redraw under the new bound
          if (j < size) {
            const login = page.logins[j % PER_PAGE];
            if (login) return login;
          }
          continue;
        }
        size = await this.count(query, true, this.countTtl(winTo));
      }

      if (size > bound) { await raiseBound(size); continue; }
      if (j >= size) continue; // rejected without calling GitHub (keeps it uniform)

      searches++;
      if (j < SEARCH_RESULT_CAP) {
        const page = await this.deps.search(query, Math.floor(j / PER_PAGE) + 1, PER_PAGE);
        const login = page.logins[j % PER_PAGE];
        if (login) return login;
        continue;
      }
      // Position past the search cap: reach it by bisecting the window on time
      const login = await this.pickNth(base, winFrom, winTo, j, size);
      if (login) return login;
    }
    return null;
  }

  /**
   * Windows that ended days ago can't gain new signups, so their sizes keep for a
   * week; the newest window is re-counted hourly so brand-new accounts show up.
   */
  private countTtl(toMs: number): number {
    return toMs < this.deps.now() - 2 * DAY * 1000 ? COUNT_TTL : RECENT_COUNT_TTL;
  }

  /** The n-th dev (0-based, join order) of `base` within [fromMs, toMs] that holds `count` devs. */
  private async pickNth(base: string, fromMs: number, toMs: number, n: number, count: number): Promise<string | null> {
    let lo = fromMs;
    let hi = toMs;
    while (count > SEARCH_RESULT_CAP && hi - lo > 1000) {
      const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
      const left = await this.count(`${base} ${createdQualifier(lo, mid)}`, true, this.countTtl(mid));
      if (n < left) {
        hi = mid;
        count = left;
      } else {
        n -= left;
        count -= left;
        lo = mid + 1000;
      }
    }
    if (n >= Math.min(count, SEARCH_RESULT_CAP)) return null;
    const page = await this.deps.search(`${base} ${createdQualifier(lo, hi)}`, Math.floor(n / PER_PAGE) + 1, PER_PAGE);
    return page.logins[n % PER_PAGE] ?? null;
  }

  private async count(query: string, useCache = true, ttl = COUNT_TTL, keyPrefix = 'count'): Promise<number> {
    const key = `${keyPrefix}:${query}`;
    if (useCache) {
      const cached = await this.deps.cache.get<number>(key);
      if (cached !== undefined) return cached;
    }
    const { totalCount } = await this.deps.search(query, 1, 1);
    await this.deps.cache.set(key, totalCount, ttl);
    return totalCount;
  }

  // ── id space helpers ──

  /**
   * An id no user account exceeds: the newest signup found by the search, plus
   * headroom. Overshooting is harmless (a few rejected draws); undershooting
   * would hide brand-new accounts, so we never do.
   */
  async maxId(): Promise<number> {
    const cached = await this.deps.cache.get<number>('maxId');
    if (cached) return cached;

    let newest = 0;
    for (const hours of [6, 72, 24 * 60]) {
      const since = isoSeconds(this.deps.now() - hours * 3600 * 1000);
      const page = await this.deps.search(`type:user created:>=${since}`, 1, 1, 'desc');
      if (page.ids.length) {
        newest = page.ids[0];
        break;
      }
    }
    if (!newest) {
      const page = await this.deps.search('type:user', 1, 1, 'desc');
      newest = page.ids[0] ?? 1;
    }
    const bound = newest + Math.ceil(newest * MAX_ID_MARGIN);
    await this.deps.cache.set('maxId', bound, MAX_ID_TTL);
    return bound;
  }

  /**
   * Point k of the global signup curve: the first account found in ids
   * [k·step+1, (k+1)·step), so points can never overtake each other. `null` when
   * that stretch is entirely deleted. Shared by every pool and cached forever
   * once the stretch is safely in the past.
   */
  private async curvePoint(k: number, maxId: number): Promise<CurvePoint | null> {
    const start = k * this.gridStep + 1;
    if (start > maxId) return null;
    const key = `curve:${this.gridStep}:${k}`;
    const cached = await this.deps.cache.get<CurvePoint | 0>(key);
    if (cached !== undefined) return cached || null;

    const end = start + this.gridStep; // exclusive
    const stride = Math.max(1, Math.floor(this.gridStep / 20));
    let found: CurvePoint | null = null;
    for (let since = start - 1, probes = 0; probes < ANCHOR_PROBES && since < end - 1; probes++) {
      const next = await this.deps.firstAccountAfter(since);
      if (!next) {
        since += stride; // inside a run of deleted ids: step over it
        continue;
      }
      if (next.id >= end) break;
      const account = await this.deps.accountById(next.id);
      if (account) {
        found = { id: account.id, t: Date.parse(account.createdAt) };
        break;
      }
      since = next.id; // deleted between the two calls
    }

    const newest = maxId / (1 + MAX_ID_MARGIN);
    if (found || end + this.gridStep < newest) await this.deps.cache.set(key, found ?? 0, FOREVER);
    return found;
  }

  /** Nearest curve points around an id: lower.id <= id < upper.id. */
  private async bracket(id: number, maxId: number): Promise<{ lower: CurvePoint; upper: CurvePoint }> {
    const k = Math.floor((id - 1) / this.gridStep);
    let lower: CurvePoint = { id: 0, t: GITHUB_EPOCH };
    for (let i = k; i >= 0; i--) {
      const p = await this.curvePoint(i, maxId);
      if (p && p.id <= id) {
        lower = p;
        break;
      }
    }
    let upper: CurvePoint = { id: maxId + 1, t: this.deps.now() };
    for (let i = k; i * this.gridStep + 1 <= maxId; i++) {
      const p = await this.curvePoint(i, maxId);
      if (p && p.id > id) {
        upper = p;
        break;
      }
    }
    return { lower, upper };
  }

  /**
   * Approximate signup time of an account id: linear interpolation between real
   * accounts of the signup curve. Being monotone, it cuts time into disjoint
   * windows — all the window sampling needs to stay uniform.
   */
  async timeAtId(id: number): Promise<number> {
    const maxId = await this.maxId();
    if (id > maxId) return this.deps.now();
    const { lower, upper } = await this.bracket(id, maxId);
    const frac = (id - lower.id) / Math.max(1, upper.id - lower.id);
    return Math.floor((lower.t + Math.max(0, upper.t - lower.t) * frac) / 1000) * 1000;
  }

  /**
   * Inclusive id range that contains every account created within the filter's
   * dates (possibly a bit more, never less).
   */
  async idRange(filter: PoolFilter): Promise<[number, number]> {
    const maxId = await this.maxId();
    const [fromMs, toMs] = filterTimeRange(filter, this.deps.now());
    const points = Math.ceil(maxId / this.gridStep);
    const startOf = (k: number) => k * this.gridStep + 1;

    // smallest k in [0, points] whose grid start maps to a time > ms
    const firstStartAfter = async (ms: number) => {
      let lo = 0;
      let hi = points;
      while (lo < hi) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if ((await this.timeAtId(startOf(mid))) > ms) hi = mid;
        else lo = mid + 1;
      }
      return lo;
    };

    let idLo = 1;
    if (filter.createdAfter) {
      // accounts below a real curve point no later than fromMs signed up before fromMs
      const k = (await firstStartAfter(fromMs)) - 1;
      if (k >= 0) idLo = Math.max(1, (await this.bracket(startOf(k), maxId)).lower.id);
    }
    let idHi = maxId;
    if (filter.createdBefore) {
      // accounts from a real curve point later than toMs onwards signed up after toMs
      const k = await firstStartAfter(toMs);
      if (k < points) idHi = Math.min(maxId, (await this.bracket(startOf(k), maxId)).upper.id - 1);
    }
    return [idLo, idHi];
  }
}
