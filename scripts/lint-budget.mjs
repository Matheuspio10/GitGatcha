/**
 * Lint with an error budget (used by CI).
 *
 * The codebase still has old lint errors (mostly `any`), so a plain `eslint`
 * would fail every PR. This fails only when the error count goes ABOVE the
 * budget: new code can't add errors, and the budget is lowered as old ones
 * are fixed. Run locally with `node scripts/lint-budget.mjs`.
 */
import { ESLint } from 'eslint';

/** Lower this whenever the count drops (the script tells you when). */
const ERROR_BUDGET = 101;

const eslint = new ESLint();
const results = await eslint.lintFiles(['.']);
const errors = results.reduce((sum, r) => sum + r.errorCount, 0);
const warnings = results.reduce((sum, r) => sum + r.warningCount, 0);

console.log(`ESLint: ${errors} errors (budget ${ERROR_BUDGET}), ${warnings} warnings`);

if (errors > ERROR_BUDGET) {
  const formatter = await eslint.loadFormatter('stylish');
  console.log(await formatter.format(results.filter(r => r.errorCount > 0)));
  console.error(`\n${errors - ERROR_BUDGET} lint error(s) above the budget. Fix the new ones listed above.`);
  process.exit(1);
}
if (errors < ERROR_BUDGET) {
  console.log(`Below budget: lower ERROR_BUDGET in scripts/lint-budget.mjs to ${errors}.`);
}
