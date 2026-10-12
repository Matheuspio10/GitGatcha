/**
 * Prints the balance simulator report (pure: no database, no network).
 *
 *   node --import tsx scripts/balance-sim.ts [seed] [impact|fame]
 */
import { formatSimReport, runBalanceSim } from '../src/lib/balanceSim';
import { STAT_FORMULA, StatFormulaName } from '../src/lib/cardStats';

const seed = Number(process.argv[2] ?? 1234);
const formula = (process.argv[3] ?? STAT_FORMULA) as StatFormulaName;
console.log(`Stat formula: ${formula}\n`);
console.log(formatSimReport(runBalanceSim({ seed, formula })));
