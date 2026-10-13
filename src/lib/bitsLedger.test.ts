import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { BITS_REASONS, bitsReasonLabel } from './bitsReasons';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

test('only the ledger changes a balance (every BITS change lands in the history)', () => {
  const offenders = sourceFiles('src')
    .filter(file => !file.split(sep).join('/').endsWith('src/lib/bitsLedger.ts'))
    .filter(file => {
      const code = readFileSync(file, 'utf8');
      return /currency:\s*\{\s*(increment|decrement)/.test(code) || /SET\s+"currency"/i.test(code);
    });
  assert.deepStrictEqual(offenders, [], `Use addBits / spendBits (src/lib/bitsLedger.ts) in: ${offenders.join(', ')}`);
});

test('every reason has a label; unknown reasons fall back to the code', () => {
  for (const [code, label] of Object.entries(BITS_REASONS)) assert.strictEqual(bitsReasonLabel(code), label);
  assert.strictEqual(bitsReasonLabel('something_new'), 'something_new');
});
