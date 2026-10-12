/**
 * Card stat formulas: GitHub numbers → ATK / DEF / HP.
 *
 * Pure and client-safe (the Wiki renders the active formula from here). Two
 * candidates, both tuned with the balance simulator (src/lib/balanceSim.ts,
 * `npm test`, `node --import tsx scripts/balance-sim.ts`) and compared on real
 * profiles by `scripts/stat-examples.ts`. `STAT_FORMULA` picks the live one
 * (owner decision: 'fame').
 *
 * 'impact' — rarity comes from the profile, stats give variety:
 *   ATK ← stars + forks *per follower*, DEF ← repos and gists, HP ← account age,
 *   tiny rarity multiplier (rarity.ts). Closest to the original ROADMAP targets
 *   (Legendary vs Common ~94%, adjacent ~57–65%) but famous devs with a huge
 *   audience get a low ATK (gaearon 16, torvalds 51 vs 50 for an empty account).
 *
 * 'fame' — stats grow monotonically with fame on a log scale:
 *   ATK ← log10(stars + forks), DEF ← repos/gists (capped) + log10(followers),
 *   HP ← account age + log10(followers), rarity multiplier 1.00–1.04
 *   (FAME_RARITY_MULTIPLIER). A famous dev always out-hits a 0-star account;
 *   rarity decides more often (sim: Legendary vs Common ~99.8%, adjacent
 *   ~71–76%, Common vs Uncommon ~83%). Any extra fame weight or a steeper
 *   multiplier pushes every tier towards 100%, because star counts track the
 *   follower band much more than they vary inside it.
 *
 * Both formulas compress every input (logs, powers < 1, caps): a repo spammer
 * or a viral repo is strong, never 100× an ordinary card. Repos and gists only
 * count up to `repoCap` (the 300 repos the stats are fetched from).
 */
import { RARITY_STAT_MULTIPLIER, Rarity } from './rarity';

export type StatFormulaName = 'impact' | 'fame';

/** The formula used by buildDevStats (and so by scripts/recalculate-cards.ts). */
export const STAT_FORMULA: StatFormulaName = 'fame';

/**
 * Bump whenever stat formulas or multipliers change: stats stored at draw time
 * (BoosterReserve) with another version are discarded instead of being granted.
 */
export const STAT_VERSION = `${STAT_FORMULA}-2`;

export interface StatInputs {
  totalStars: number;
  totalForks: number;
  publicRepos: number;
  publicGists: number;
  followers: number;
  accountAgeYears: number;
}

export interface BaseStats {
  atk: number;
  def: number;
  hp: number;
}

/** Floors applied after the rarity multiplier. */
export const STAT_MINIMUMS: BaseStats = { atk: 10, def: 10, hp: 50 };

const nonNeg = (x: number) => Math.max(0, x || 0);
const ln1p = (x: number) => Math.log(1 + nonNeg(x));

// ─── 'impact' ────────────────────────────────────────────────────────────────

export type ImpactFormula = {
  atk: { base: number; exponent: number; offset: number; forkWeight: number; min: number; max: number };
  def: { base: number; scale: number; exponent: number; gistWeight: number };
  hp: { base: number; years: number; maxYears: number; repos: number; followers: number };
  repoCap: number;
};

export const IMPACT_FORMULA: ImpactFormula = {
  /**
   * ATK = base × impact^exponent, clamped to [min, max], where
   * impact = (stars + forkWeight·forks + offset) / (followers + offset).
   */
  atk: { base: 50, exponent: 0.37, offset: 10, forkWeight: 1, min: 15, max: 300 },
  /** DEF = base + scale · (min(repos, repoCap) + gistWeight·min(gists, repoCap))^exponent */
  def: { base: 0, scale: 13, exponent: 0.5, gistWeight: 0.25 },
  /** HP = base + years·min(age, maxYears) + repos·ln(1+min(repos, repoCap)) + followers·ln(1+followers) */
  hp: { base: 100, years: 55, maxYears: 14, repos: 0, followers: 0 },
  repoCap: 300,
};

/** Stars and forks earned per follower (with an offset so tiny accounts land near 1). */
export function impact(i: StatInputs, f: ImpactFormula = IMPACT_FORMULA): number {
  const stars = nonNeg(i.totalStars) + f.atk.forkWeight * nonNeg(i.totalForks);
  return (stars + f.atk.offset) / (nonNeg(i.followers) + f.atk.offset);
}

export function computeImpactStats(i: StatInputs, f: ImpactFormula = IMPACT_FORMULA): BaseStats {
  const repos = Math.min(nonNeg(i.publicRepos), f.repoCap);
  const years = Math.min(nonNeg(i.accountAgeYears), f.hp.maxYears);
  return {
    atk: Math.min(f.atk.max, Math.max(f.atk.min, f.atk.base * Math.pow(impact(i, f), f.atk.exponent))),
    def: f.def.base + f.def.scale * Math.pow(repos + f.def.gistWeight * Math.min(nonNeg(i.publicGists), f.repoCap), f.def.exponent),
    hp: f.hp.base + f.hp.years * years + f.hp.repos * ln1p(repos) + f.hp.followers * ln1p(i.followers),
  };
}

// ─── 'fame' ──────────────────────────────────────────────────────────────────

export type FameFormula = {
  /** ATK = base + scale · log10(stars + forkWeight·forks + offset)^power */
  atk: { base: number; scale: number; power: number; offset: number; forkWeight: number };
  /** DEF = base + scale · (min(repos, repoCap) + gistWeight·min(gists, repoCap))^exponent + followers·log10(1 + followers) */
  def: { base: number; scale: number; exponent: number; gistWeight: number; followers: number };
  /** HP = base + years·min(age, maxYears) + followers·log10(1 + followers) */
  hp: { base: number; years: number; maxYears: number; followers: number };
  repoCap: number;
};

export const FAME_FORMULA: FameFormula = {
  atk: { base: 40, scale: 4.5, power: 1.2, offset: 10, forkWeight: 1 },
  def: { base: 0, scale: 11, exponent: 0.5, gistWeight: 0.25, followers: 2 },
  hp: { base: 50, years: 55, maxYears: 14, followers: 5 },
  repoCap: 300,
};

/** Rarity multiplier used with the 'fame' formula. */
export const FAME_RARITY_MULTIPLIER: Record<Rarity, number> = {
  Common: 1.0,
  Uncommon: 1.0,
  Rare: 1.0,
  Epic: 1.02,
  Legendary: 1.04,
};

const log10p = (x: number) => Math.log10(1 + nonNeg(x));

export function computeFameStats(i: StatInputs, f: FameFormula = FAME_FORMULA): BaseStats {
  const repos = Math.min(nonNeg(i.publicRepos), f.repoCap);
  const years = Math.min(nonNeg(i.accountAgeYears), f.hp.maxYears);
  const fame = nonNeg(i.totalStars) + f.atk.forkWeight * nonNeg(i.totalForks);
  return {
    atk: f.atk.base + f.atk.scale * Math.pow(Math.log10(fame + f.atk.offset), f.atk.power),
    def: f.def.base + f.def.scale * Math.pow(repos + f.def.gistWeight * Math.min(nonNeg(i.publicGists), f.repoCap), f.def.exponent)
      + f.def.followers * log10p(i.followers),
    hp: f.hp.base + f.hp.years * years + f.hp.followers * log10p(i.followers),
  };
}

// ─── Active formula ──────────────────────────────────────────────────────────

/** Raw stats (before the rarity multiplier) with the given formula. */
export function computeBaseStats(i: StatInputs, formula: StatFormulaName = STAT_FORMULA): BaseStats {
  return formula === 'fame' ? computeFameStats(i) : computeImpactStats(i);
}

export function rarityMultipliers(formula: StatFormulaName = STAT_FORMULA): Record<Rarity, number> {
  return formula === 'fame' ? FAME_RARITY_MULTIPLIER : RARITY_STAT_MULTIPLIER;
}

/** Rarity multipliers of the live formula (what the Wiki shows). */
export const ACTIVE_RARITY_MULTIPLIER = rarityMultipliers();

/** Applies the rarity multiplier and the minimums (integers, as stored in `Card`). */
export function finalizeStats(base: BaseStats, multiplier: number): BaseStats {
  return {
    atk: Math.max(STAT_MINIMUMS.atk, Math.floor(base.atk * multiplier)),
    def: Math.max(STAT_MINIMUMS.def, Math.floor(base.def * multiplier)),
    hp: Math.max(STAT_MINIMUMS.hp, Math.floor(base.hp * multiplier)),
  };
}

/** Final card stats for a profile of the given rarity. */
export function computeCardStats(i: StatInputs, rarity: Rarity, formula: StatFormulaName = STAT_FORMULA): BaseStats {
  return finalizeStats(computeBaseStats(i, formula), rarityMultipliers(formula)[rarity]);
}

const n = (x: number) => String(+x.toFixed(2));

/** Player-facing description of a formula (rendered by the Wiki). */
export function describeStatFormula(formula: StatFormulaName = STAT_FORMULA): { atk: string; def: string; hp: string } {
  if (formula === 'fame') {
    const f = FAME_FORMULA;
    return {
      atk: `ATK grows with fame: ${n(f.atk.base)} + ${n(f.atk.scale)} × log10(stars + forks + ${f.atk.offset})^${n(f.atk.power)}. More stars always means more ATK, with diminishing returns.`,
      def: `DEF comes from the body of work: ${f.def.base > 0 ? `${n(f.def.base)} + ` : ''}${n(f.def.scale)} × (repos + ${n(f.def.gistWeight)} × gists)^${n(f.def.exponent)} + ${n(f.def.followers)} × log10(1 + followers). Repos and gists count up to ${f.repoCap} each.`,
      hp: `HP comes from experience and reach: ${n(f.hp.base)} + ${n(f.hp.years)} × account age in years (up to ${f.hp.maxYears}) + ${n(f.hp.followers)} × log10(1 + followers).`,
    };
  }
  const f = IMPACT_FORMULA;
  return {
    atk: `ATK comes from impact — stars and forks earned per follower: impact = (stars + forks + ${f.atk.offset}) / (followers + ${f.atk.offset}); ATK = ${n(f.atk.base)} × impact^${n(f.atk.exponent)}, between ${f.atk.min} and ${f.atk.max}. Code starred far beyond its author's audience hits hard (a big audience already pays off in rarity).`,
    def: `DEF comes from the body of work: ${f.def.base > 0 ? `${n(f.def.base)} + ` : ''}${n(f.def.scale)} × (repos + ${n(f.def.gistWeight)} × gists)^${n(f.def.exponent)}. Repos and gists count up to ${f.repoCap} each.`,
    hp: `HP comes from experience: ${n(f.hp.base)} + ${n(f.hp.years)} × account age in years (up to ${f.hp.maxYears})${f.hp.repos > 0 ? ` + ${n(f.hp.repos)} × ln(1 + repos)` : ''}${f.hp.followers > 0 ? ` + ${n(f.hp.followers)} × ln(1 + followers)` : ''}. Old accounts are tanky.`,
  };
}
