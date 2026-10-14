/**
 * Pure, seeded battle simulator used to balance card stats and combat.
 *
 * No database, no network: it generates synthetic GitHub developers, turns them
 * into cards with the real `buildDevStats`, and fights random 3v3 teams with the
 * real `resolve3v3Battle`. Run it through `balanceSim.test.ts`
 * (`node --import tsx --test src/lib/balanceSim.test.ts`), which prints a
 * summary and asserts the balance targets (ROADMAP 2.3).
 *
 * ─── Synthetic developer model (assumptions) ────────────────────────────────
 * Boosters draw uniformly among every developer of a follower band that matches
 * the pack's filter, so a band is dominated by its low end (most GitHub accounts
 * have 0–5 followers). Each synthetic dev first picks a booster pool (language
 * packs need a repo in that language, contributor packs >20–50 repos, era packs
 * a signup date — see SIM_POOLS) and is resampled until it fits. Everything
 * below is heavy-tailed and loosely calibrated on public GitHub numbers:
 *
 * - followers: truncated power law inside the band, P(F ≥ f) ∝ (f+1)^-1.2
 *   (Legendary: from 5 000 with exponent 1.5, capped at 300 000).
 * - total stars: log-normal around 1.5 × followers (σ = 1.3 in log space) —
 *   famous accounts usually own popular repos, but "influencer" accounts with
 *   few stars and quiet devs with one viral repo both exist.
 * - forks: log-normal around 20% of the stars (σ = 0.6).
 * - public repos: log-normal around 4 + 6·ln(1 + followers) (σ = 0.8); 2% are
 *   repo spammers (mirror/fork bots) with 300–3 000 repos.
 * - gists: 40% have none; the rest log-normal around 1 + 2·ln(1 + followers).
 * - account age: 0.2–18 years, skewed older for more followers.
 * - primary language: the pack's language for language packs; otherwise
 *   GitHub-like shares (JS 17%, Python 16%, Java 9%, TS 8%, C++/C# 5%, Go/PHP
 *   4%, …, ~8% "others" with no combat type; accounts without repos are "Unknown").
 * - only the first 300 repos are fetched (MAX_REPO_PAGES), like production.
 */
import { buildDevStats, DevStats } from './githubService';
import { BattleCard, BattleResult, getCardType, getTypeMultiplier, resolve3v3Battle } from './battleResolver';
import { RARITY_FOLLOWER_BANDS, RARITY_ORDER, Rarity } from './rarity';
import { computeCardStats, StatFormulaName, StatInputs } from './cardStats';
import { maxTrainingLevel } from './training';

// ─── RNG ──────────────────────────────────────────────────────────────────────

export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** exp(N(ln(median + 1), sigma)) − 1, rounded and clamped at 0. */
function logNormalCount(rng: Rng, median: number, sigma: number): number {
  return Math.max(0, Math.round(Math.exp(Math.log(median + 1) + sigma * gaussian(rng)) - 1));
}

// ─── Synthetic developers ─────────────────────────────────────────────────────

const LANGUAGE_SHARES: [string, number][] = [
  ['JavaScript', 17], ['Python', 16], ['Java', 9], ['TypeScript', 8], ['C++', 5], ['C#', 5],
  ['Go', 4], ['PHP', 4], ['C', 3], ['Ruby', 3], ['Shell', 3], ['HTML', 3], ['Jupyter Notebook', 2.5],
  ['Rust', 2], ['Kotlin', 2], ['Swift', 2], ['CSS', 2], ['Dart', 1.5],
  ['Scala', 1], ['Lua', 1], ['Elixir', 1], ['Haskell', 1], ['Vim Script', 1], ['Objective-C', 1], ['R', 1], ['Perl', 1],
];
const LANGUAGE_TOTAL = LANGUAGE_SHARES.reduce((a, [, w]) => a + w, 0);

function pickLanguage(rng: Rng): string {
  let roll = rng() * LANGUAGE_TOTAL;
  for (const [lang, w] of LANGUAGE_SHARES) {
    roll -= w;
    if (roll < 0) return lang;
  }
  return 'JavaScript';
}

function sampleFollowers(rng: Rng, band: Rarity): number {
  const { min, max } = RARITY_FOLLOWER_BANDS[band];
  const a = max === null ? 1.5 : 1.2;
  const hi = (max ?? 300_000) + 2;
  const lo = min + 1;
  // Inverse CDF of a truncated Pareto on [lo, hi)
  const tail = 1 - Math.pow(hi / lo, -a);
  const x = lo * Math.pow(1 - rng() * tail, -1 / a);
  return Math.min(max ?? 300_000, Math.max(min, Math.floor(x) - 1));
}

type SimUser = Parameters<typeof buildDevStats>[0];
type SimRepo = Parameters<typeof buildDevStats>[1][number];

export interface SyntheticDev {
  user: SimUser;
  repos: SimRepo[];
}

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/**
 * Booster pools a card can come from (packDefinitions.ts), with a rough share of
 * the cards in circulation. Language packs need ≥1 repo in that language;
 * contributor packs need >20–50 repos; era packs filter on the signup date.
 */
type SimPool =
  | { kind: 'language'; languages: string[] }
  | { kind: 'repos'; min: number }
  | { kind: 'era'; minAge?: number; maxAge?: number; minRepos?: number }
  | { kind: 'open' };

const SIM_POOLS: [SimPool, number][] = [
  [{ kind: 'language', languages: ['JavaScript', 'JavaScript', 'TypeScript'] }, 6],
  [{ kind: 'language', languages: ['Python'] }, 6],
  [{ kind: 'language', languages: ['Rust'] }, 5],
  [{ kind: 'language', languages: ['CSS'] }, 5],
  [{ kind: 'language', languages: ['Go'] }, 5],
  [{ kind: 'language', languages: ['Ruby'] }, 5],
  [{ kind: 'language', languages: ['C', 'C++'] }, 5],
  [{ kind: 'repos', min: 50 }, 10],
  [{ kind: 'repos', min: 30 }, 5],
  [{ kind: 'repos', min: 20 }, 10],
  [{ kind: 'era', minAge: 16.8 }, 4], // GitHub OGs (before 2010)
  [{ kind: 'era', maxAge: 4.8 }, 3], // New Blood (after 2022)
  [{ kind: 'era', minAge: 11.8, minRepos: 10 }, 3], // The Fossils
  [{ kind: 'open' }, 28], // regional, mystery, legendary drop, junk drawer, big tech
];
const POOL_TOTAL = SIM_POOLS.reduce((a, [, w]) => a + w, 0);

function pickPool(rng: Rng): SimPool {
  let roll = rng() * POOL_TOTAL;
  for (const [pool, w] of SIM_POOLS) {
    roll -= w;
    if (roll < 0) return pool;
  }
  return { kind: 'open' };
}

interface Profile {
  followers: number;
  publicRepos: number;
  gists: number;
  ageYears: number;
}

function sampleProfile(rng: Rng, band: Rarity): Profile {
  const followers = sampleFollowers(rng, band);
  const lnF = Math.log(1 + followers);
  const spammer = rng() < 0.02;
  return {
    followers,
    publicRepos: spammer ? Math.floor(300 * Math.pow(10, rng())) : logNormalCount(rng, 4 + 6 * lnF, 0.8),
    gists: rng() < 0.4 ? 0 : logNormalCount(rng, 1 + 2 * lnF, 1.0),
    ageYears: 0.2 + 17.8 * Math.pow(rng(), 1 / (1 + 0.15 * lnF)),
  };
}

function fitsPool(p: Profile, pool: SimPool): boolean {
  switch (pool.kind) {
    case 'language': return p.publicRepos >= 1;
    case 'repos': return p.publicRepos > pool.min;
    case 'era': return (pool.minAge === undefined || p.ageYears >= pool.minAge)
      && (pool.maxAge === undefined || p.ageYears <= pool.maxAge)
      && (pool.minRepos === undefined || p.publicRepos > pool.minRepos);
    default: return true;
  }
}

/**
 * One synthetic developer of the given follower band (see the assumptions
 * above), drawn from a random booster pool (rejection sampling on its filter).
 */
export function syntheticDeveloper(rng: Rng, band: Rarity, id: number, now = Date.now()): SyntheticDev {
  const pool = pickPool(rng);
  let profile = sampleProfile(rng, band);
  for (let tries = 0; tries < 500 && !fitsPool(profile, pool); tries++) profile = sampleProfile(rng, band);
  const { followers, publicRepos, gists, ageYears } = profile;

  const fetched = Math.min(publicRepos, 300);
  const totalStars = fetched === 0 ? 0 : logNormalCount(rng, 1.5 * followers, 1.3);
  const totalForks = fetched === 0 ? 0 : logNormalCount(rng, 0.2 * totalStars, 0.6);
  const language = pool.kind === 'language'
    ? pool.languages[Math.floor(rng() * pool.languages.length)]
    : pickLanguage(rng);

  // Split stars/forks across repos with a heavy tail (one or two repos carry the account).
  const weights = Array.from({ length: fetched }, () => Math.pow(rng(), 3));
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const repos: SimRepo[] = weights.map((w, i) => ({
    stargazers_count: Math.round((totalStars * w) / wSum),
    forks_count: Math.round((totalForks * w) / wSum),
    // The primary language owns the big repos; side projects use other languages.
    language: i === 0 || rng() < 0.6 ? language : (rng() < 0.2 ? null : pickLanguage(rng)),
    size: i === 0 || rng() < 0.6 ? 5000 : 100,
  }));

  return {
    user: {
      id,
      login: `sim-${band.toLowerCase()}-${id}`,
      type: 'User',
      name: null,
      bio: null,
      avatar_url: '',
      followers,
      public_repos: publicRepos,
      public_gists: gists,
      created_at: new Date(now - ageYears * YEAR_MS).toISOString(),
    },
    repos,
  };
}

// ─── Cards & teams ────────────────────────────────────────────────────────────

/** The stat inputs buildDevStats derives from a (synthetic) profile. */
export function statInputsOf(dev: SyntheticDev, now = Date.now()): StatInputs {
  return {
    totalStars: dev.repos.reduce((a, r) => a + r.stargazers_count, 0),
    totalForks: dev.repos.reduce((a, r) => a + r.forks_count, 0),
    publicRepos: dev.user.public_repos,
    publicGists: dev.user.public_gists || 0,
    followers: dev.user.followers,
    accountAgeYears: (now - Date.parse(dev.user.created_at)) / YEAR_MS,
  };
}

/** Card for a synthetic dev with a given stat formula (rarity, language… from buildDevStats). */
export function statsWithFormula(formula: StatFormulaName): (dev: SyntheticDev) => DevStats {
  return dev => {
    const stats = buildDevStats(dev.user, dev.repos);
    return { ...stats, ...computeCardStats(statInputsOf(dev), stats.rarity as Rarity, formula) };
  };
}

export type CardPools = Record<Rarity, DevStats[]>;

/**
 * Builds `perBand` synthetic developers in every follower band and groups the
 * resulting cards by their FINAL rarity (star-bonus promotions included).
 */
export function buildCardPools(seed: number, perBand: number, statsOf: (dev: SyntheticDev) => DevStats = d => buildDevStats(d.user, d.repos)): CardPools {
  const rng = mulberry32(seed);
  const pools = Object.fromEntries(RARITY_ORDER.map(r => [r, [] as DevStats[]])) as CardPools;
  let id = 1;
  for (const band of RARITY_ORDER) {
    for (let i = 0; i < perBand; i++) {
      const stats = statsOf(syntheticDeveloper(rng, band, id++));
      pools[stats.rarity as Rarity].push(stats);
    }
  }
  return pools;
}

let cardSerial = 0;

export function toBattleCard(stats: DevStats, trainingLevel = 0): BattleCard {
  const card = {
    id: `${stats.githubUsername}#${cardSerial++}`,
    name: stats.githubUsername,
    atk: stats.atk,
    def: stats.def,
    hp: stats.hp,
    maxHp: stats.hp,
    stamina: 100,
    rarity: stats.rarity as Rarity,
    primaryLanguage: stats.primaryLanguage,
    loyaltyTier: 'none',
    trainingLevel,
  };
  return { ...card, type: getCardType(card) };
}

function pickTeam(rng: Rng, pool: DevStats[], trainingLevel = 0): BattleCard[] {
  const picked = new Set<number>();
  while (picked.size < 3) picked.add(Math.floor(rng() * pool.length));
  return [...picked].map(i => toBattleCard(pool[i], trainingLevel));
}

/** Team of 3 drawn from the pools with the given rarity weights. */
function pickWeightedTeam(rng: Rng, pools: CardPools, weights: Record<Rarity, number>): BattleCard[] {
  const total = RARITY_ORDER.reduce((a, r) => a + weights[r], 0);
  const team: BattleCard[] = [];
  while (team.length < 3) {
    let roll = rng() * total;
    let rarity: Rarity = 'Common';
    for (const r of RARITY_ORDER) {
      roll -= weights[r];
      if (roll < 0) { rarity = r; break; }
    }
    team.push(toBattleCard(pools[rarity][Math.floor(rng() * pools[rarity].length)]));
  }
  return team;
}

// ─── Battles ──────────────────────────────────────────────────────────────────

export type Resolver = (c: BattleCard[], d: BattleCard[], rng: Rng) => BattleResult;

export const defaultResolver: Resolver = (c, d, rng) => resolve3v3Battle(c, d, { rng });

/** Fights A vs B; A is the challenger on even rounds and the defender on odd ones (cancels the tie rule). */
function fight(resolve: Resolver, rng: Rng, a: BattleCard[], b: BattleCard[], round: number): { aWon: boolean; result: BattleResult; aIsChallenger: boolean } {
  const aIsChallenger = round % 2 === 0;
  const result = aIsChallenger ? resolve(a, b, rng) : resolve(b, a, rng);
  const aWon = (result.winner === 'CHALLENGER') === aIsChallenger;
  return { aWon, result, aIsChallenger };
}

/** Turns the two openers spent fighting each other (both entered fresh). */
export function openingMatchupTurns(result: BattleResult): number {
  const first = result.log.find(t => t.turnNumber > 0 && t.cCardId);
  if (!first) return 0;
  return result.log.filter(t => t.turnNumber > 0 && t.cCardId === first.cCardId && t.dCardId === first.dCardId).length;
}

function sum(team: BattleCard[], key: 'atk' | 'def' | 'hp'): number {
  return team.reduce((a, c) => a + c[key], 0);
}

/** Expected type edge of A over B: Σ ln(mult A→B) − ln(mult B→A) over the 9 pairings. */
export function typeEdge(a: BattleCard[], b: BattleCard[]): number {
  let edge = 0;
  for (const x of a) for (const y of b) edge += Math.log(getTypeMultiplier(x.type, y.type)) - Math.log(getTypeMultiplier(y.type, x.type));
  return edge;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export interface MirrorStats {
  rarity: Rarity;
  /** Win rate of the team that is A in each pairing — should hover around 50%. */
  winRate: number;
  /** Pearson correlation between "A won" and A − B of the team sums. */
  corr: { atk: number; def: number; hp: number; type: number };
  /** |corr| of each stat over the sum of the three. */
  statShare: { atk: number; def: number; hp: number };
  /** How often the team with the better type edge won (pairings with a non-zero edge only). */
  typeFavoriteWins: number;
}

export interface SimReport {
  /** Win rate of the row rarity (full team) against the column rarity (full team). */
  tierMatrix: Record<Rarity, Record<Rarity, number>>;
  mirrors: MirrorStats[];
  /** Mixed teams drawn with the live-DB rarity mix: win rate of the team with the higher average rarity, by gap. */
  mixedByGap: { gap: string; battles: number; higherWins: number }[];
  /** Turns the two openers fight (both fresh): median, 10th/90th percentile and share within (3, 25). */
  openingTurns: { median: number; p10: number; p90: number; within: number };
  /** Average total turns per battle. */
  avgBattleTurns: number;
  /** Mirror + mixed battles: win rate of the teams a card of each combat type played in. */
  typeWinRates: { type: string; appearances: number; winRate: number }[];
  pools: Record<Rarity, { cards: number; atk: number; def: number; hp: number; neutralShare: number }>;
  /**
   * Fully trained teams (training.ts): win rate against an untrained team of the
   * same rarity, and against an untrained team one rarity up (null for Legendary).
   */
  training: { rarity: Rarity; maxLevel: number; vsSame: number; vsNextUp: number | null }[];
}

/** Card mix of the live database after the follower-based recalculation (ROADMAP 2.3). */
export const LIVE_RARITY_MIX: Record<Rarity, number> = { Common: 147, Uncommon: 125, Rare: 35, Epic: 182, Legendary: 229 };

export interface SimOptions {
  seed?: number;
  perBand?: number;
  battlesPerPair?: number;
  mirrorBattles?: number;
  mixedBattles?: number;
  resolve?: Resolver;
  /** Stat formula to build the cards with (default: the live STAT_FORMULA). Ignored when `statsOf` is given. */
  formula?: StatFormulaName;
  statsOf?: (dev: SyntheticDev) => DevStats;
  trainingBattles?: number;
}

export function runBalanceSim(opts: SimOptions = {}): SimReport {
  const {
    seed = 1234, perBand = 1000, battlesPerPair = 800, mirrorBattles = 1500, mixedBattles = 3000, trainingBattles = 600,
    resolve = defaultResolver, formula,
  } = opts;
  const statsOf = opts.statsOf ?? (formula ? statsWithFormula(formula) : undefined);
  const pools = buildCardPools(seed, perBand, statsOf);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const opening: number[] = [];
  let totalTurns = 0;
  let totalBattles = 0;
  const typeTally = new Map<string, { n: number; wins: number }>();
  const tallyTypes = (a: BattleCard[], b: BattleCard[], aWon: boolean) => {
    for (const [team, won] of [[a, aWon], [b, !aWon]] as const) {
      for (const c of team) {
        const t = typeTally.get(c.type) ?? { n: 0, wins: 0 };
        t.n++;
        if (won) t.wins++;
        typeTally.set(c.type, t);
      }
    }
  };
  const track = (r: BattleResult) => {
    opening.push(openingMatchupTurns(r));
    totalTurns += r.log.filter(t => t.turnNumber > 0 && t.cCardId).length;
    totalBattles++;
  };

  const tierMatrix = Object.fromEntries(RARITY_ORDER.map(r => [r, {} as Record<Rarity, number>])) as SimReport['tierMatrix'];
  for (let i = 0; i < RARITY_ORDER.length; i++) {
    for (let j = i; j < RARITY_ORDER.length; j++) {
      const ra = RARITY_ORDER[i], rb = RARITY_ORDER[j];
      let wins = 0;
      for (let k = 0; k < battlesPerPair; k++) {
        const { aWon, result } = fight(resolve, rng, pickTeam(rng, pools[ra]), pickTeam(rng, pools[rb]), k);
        if (aWon) wins++;
        track(result);
      }
      tierMatrix[ra][rb] = wins / battlesPerPair;
      tierMatrix[rb][ra] = 1 - wins / battlesPerPair;
    }
  }

  const mirrors: MirrorStats[] = RARITY_ORDER.map(rarity => {
    const won: number[] = [], dAtk: number[] = [], dDef: number[] = [], dHp: number[] = [], dType: number[] = [];
    let typeDecided = 0, typeFavWins = 0;
    for (let k = 0; k < mirrorBattles; k++) {
      const a = pickTeam(rng, pools[rarity]);
      const b = pickTeam(rng, pools[rarity]);
      const { aWon, result } = fight(resolve, rng, a, b, k);
      track(result);
      tallyTypes(a, b, aWon);
      won.push(aWon ? 1 : 0);
      // Relative differences, so that the three stats are on the same scale
      dAtk.push((sum(a, 'atk') - sum(b, 'atk')) / (sum(a, 'atk') + sum(b, 'atk')));
      dDef.push((sum(a, 'def') - sum(b, 'def')) / (sum(a, 'def') + sum(b, 'def')));
      dHp.push((sum(a, 'hp') - sum(b, 'hp')) / (sum(a, 'hp') + sum(b, 'hp')));
      const edge = typeEdge(a, b);
      dType.push(edge);
      if (Math.abs(edge) > 1e-9) {
        typeDecided++;
        if ((edge > 0) === aWon) typeFavWins++;
      }
    }
    const corr = { atk: pearson(dAtk, won), def: pearson(dDef, won), hp: pearson(dHp, won), type: pearson(dType, won) };
    const total = Math.abs(corr.atk) + Math.abs(corr.def) + Math.abs(corr.hp) || 1;
    return {
      rarity,
      winRate: won.reduce((a, b) => a + b, 0) / won.length,
      corr,
      statShare: { atk: Math.abs(corr.atk) / total, def: Math.abs(corr.def) / total, hp: Math.abs(corr.hp) / total },
      typeFavoriteWins: typeDecided ? typeFavWins / typeDecided : 0.5,
    };
  });

  const avgRank = (team: BattleCard[]) => team.reduce((a, c) => a + RARITY_ORDER.indexOf(c.rarity), 0) / 3;
  const gaps = new Map<string, { battles: number; higherWins: number }>();
  for (let k = 0; k < mixedBattles; k++) {
    const a = pickWeightedTeam(rng, pools, LIVE_RARITY_MIX);
    const b = pickWeightedTeam(rng, pools, LIVE_RARITY_MIX);
    const { aWon, result } = fight(resolve, rng, a, b, k);
    track(result);
    tallyTypes(a, b, aWon);
    const gap = avgRank(a) - avgRank(b);
    if (Math.abs(gap) < 1e-9) continue;
    const bucket = Math.abs(gap) <= 0.34 ? '≤⅓ tier' : Math.abs(gap) <= 1 ? '⅓–1 tier' : Math.abs(gap) <= 2 ? '1–2 tiers' : '>2 tiers';
    const g = gaps.get(bucket) ?? { battles: 0, higherWins: 0 };
    g.battles++;
    if ((gap > 0) === aWon) g.higherWins++;
    gaps.set(bucket, g);
  }
  const mixedByGap = ['≤⅓ tier', '⅓–1 tier', '1–2 tiers', '>2 tiers']
    .filter(gap => gaps.has(gap))
    .map(gap => ({ gap, battles: gaps.get(gap)!.battles, higherWins: gaps.get(gap)!.higherWins / gaps.get(gap)!.battles }));

  // Training: a fully trained team against untrained ones (not tracked in the other stats)
  const trainedWinRate = (rarity: Rarity, against: Rarity) => {
    let wins = 0;
    for (let k = 0; k < trainingBattles; k++) {
      const trained = pickTeam(rng, pools[rarity], maxTrainingLevel(rarity));
      if (fight(resolve, rng, trained, pickTeam(rng, pools[against]), k).aWon) wins++;
    }
    return wins / trainingBattles;
  };
  const training = RARITY_ORDER.map((rarity, i) => ({
    rarity,
    maxLevel: maxTrainingLevel(rarity),
    vsSame: trainedWinRate(rarity, rarity),
    vsNextUp: i + 1 < RARITY_ORDER.length ? trainedWinRate(rarity, RARITY_ORDER[i + 1]) : null,
  }));

  const sorted = [...opening].sort((a, b) => a - b);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const poolSummary = Object.fromEntries(RARITY_ORDER.map(r => {
    const p = pools[r];
    return [r, {
      cards: p.length,
      atk: median(p.map(c => c.atk)),
      def: median(p.map(c => c.def)),
      hp: median(p.map(c => c.hp)),
      neutralShare: p.filter(c => getCardType({ primaryLanguage: c.primaryLanguage, rarity: c.rarity }) === 'Neutral').length / (p.length || 1),
    }];
  })) as SimReport['pools'];

  return {
    tierMatrix,
    mirrors,
    mixedByGap,
    openingTurns: {
      median: quantile(sorted, 0.5),
      p10: quantile(sorted, 0.1),
      p90: quantile(sorted, 0.9),
      within: opening.filter(t => t > 3 && t < 25).length / opening.length,
    },
    avgBattleTurns: totalTurns / totalBattles,
    typeWinRates: [...typeTally.entries()]
      .map(([type, t]) => ({ type, appearances: t.n, winRate: t.wins / t.n }))
      .sort((x, y) => y.winRate - x.winRate),
    pools: poolSummary,
    training,
  };
}

const p = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

export function formatSimReport(r: SimReport): string {
  const lines: string[] = [];
  lines.push('Card pools (median stats):');
  for (const rarity of RARITY_ORDER) {
    const s = r.pools[rarity];
    lines.push(`  ${rarity.padEnd(10)} n=${String(s.cards).padStart(4)}  ATK ${String(s.atk).padStart(5)}  DEF ${String(s.def).padStart(5)}  HP ${String(s.hp).padStart(5)}  neutral ${p(s.neutralShare)}`);
  }
  lines.push('', 'Full-team win rate (row vs column):');
  lines.push(`  ${''.padEnd(10)} ${RARITY_ORDER.map(c => c.slice(0, 6).padStart(7)).join('')}`);
  for (const row of RARITY_ORDER) lines.push(`  ${row.padEnd(10)} ${RARITY_ORDER.map(c => p(r.tierMatrix[row][c]).padStart(7)).join('')}`);
  lines.push('', 'Mirror matches (same rarity): win corr. with team-sum differences, stat share, type favourite win rate');
  for (const m of r.mirrors) {
    lines.push(`  ${m.rarity.padEnd(10)} A wins ${p(m.winRate)} | r ATK ${m.corr.atk.toFixed(2)} DEF ${m.corr.def.toFixed(2)} HP ${m.corr.hp.toFixed(2)} type ${m.corr.type.toFixed(2)} | share ATK ${p(m.statShare.atk)} DEF ${p(m.statShare.def)} HP ${p(m.statShare.hp)} | type fav. wins ${p(m.typeFavoriteWins)}`);
  }
  lines.push('', 'Mixed teams (live DB rarity mix): higher average rarity wins');
  for (const g of r.mixedByGap) lines.push(`  gap ${g.gap.padEnd(9)} ${p(g.higherWins)}  (${g.battles} battles)`);
  const t = r.openingTurns;
  lines.push('', `Opening matchup length: median ${t.median} turns (p10 ${t.p10}, p90 ${t.p90}), ${p(t.within)} within 4–24 turns; ${r.avgBattleTurns.toFixed(1)} turns per battle`);
  lines.push('', 'Win rate of teams fielding each type (mirror + mixed battles):');
  const types = r.typeWinRates.map(t => `${t.type} ${p(t.winRate).trim()}`);
  for (let i = 0; i < types.length; i += 6) lines.push(`  ${types.slice(i, i + 6).join(' · ')}`);
  lines.push('', 'Fully trained team vs untrained: same rarity / one rarity up');
  for (const t of r.training) {
    lines.push(`  ${t.rarity.padEnd(10)} level ${String(t.maxLevel).padStart(2)}  same ${p(t.vsSame)}  next up ${t.vsNextUp === null ? '     —' : p(t.vsNextUp)}`);
  }
  return lines.join('\n');
}
