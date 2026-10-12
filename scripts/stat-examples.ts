/**
 * Prints card stats of a few real GitHub profiles with both stat formulas
 * ('impact' and 'fame', src/lib/cardStats.ts). Pure: the profiles are
 * hard-coded fixtures (snapshot Oct 2026, forks approximate) — no database,
 * no network.
 *
 *   node --import tsx scripts/stat-examples.ts
 */
import { computeCardStats, STAT_FORMULA, StatFormulaName, StatInputs } from '../src/lib/cardStats';
import { computeRarity } from '../src/lib/rarity';

const PROFILES: { login: string; p: StatInputs }[] = [
  { login: 'torvalds', p: { followers: 327_441, totalStars: 265_078, totalForks: 70_000, publicRepos: 11, publicGists: 0, accountAgeYears: 14.7 } },
  { login: 'gaearon', p: { followers: 93_944, totalStars: 3_532, totalForks: 900, publicRepos: 270, publicGists: 70, accountAgeYears: 14.4 } },
  { login: 'sindresorhus', p: { followers: 84_739, totalStars: 651_194, totalForks: 60_000, publicRepos: 1_100, publicGists: 100, accountAgeYears: 14.6 } },
  { login: 'kevinmehall', p: { followers: 220, totalStars: 2_867, totalForks: 300, publicRepos: 60, publicGists: 10, accountAgeYears: 15 } },
  { login: '(fresh account)', p: { followers: 0, totalStars: 0, totalForks: 0, publicRepos: 1, publicGists: 0, accountAgeYears: 0.5 } },
];

const FORMULAS: StatFormulaName[] = ['impact', 'fame'];

console.log(`Live formula: ${STAT_FORMULA}\n`);
console.log(`${'login'.padEnd(16)} ${'rarity'.padEnd(10)} ${FORMULAS.map(f => `${f.padEnd(6)} ATK   DEF    HP`).join('   │   ')}`);
for (const { login, p } of PROFILES) {
  const { rarity } = computeRarity(p.followers, p.totalStars);
  const cols = FORMULAS.map(f => {
    const s = computeCardStats(p, rarity, f);
    return `${''.padEnd(6)} ${String(s.atk).padStart(3)} ${String(s.def).padStart(5)} ${String(s.hp).padStart(5)}`;
  });
  console.log(`${login.padEnd(16)} ${rarity.padEnd(10)} ${cols.join('   │   ')}`);
}
