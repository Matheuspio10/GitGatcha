import { test, describe } from 'node:test';
import assert from 'node:assert';
import { WILDCARD, WILDCARD_EXCHANGE_RATE, maxWildcardsFrom, needsWildcards, planFragmentPayment } from './fragments';

describe('fragment payments', () => {
  test('language fragments pay first, wildcards cover the rest', () => {
    assert.deepStrictEqual(planFragmentPayment({ Rust: 20, [WILDCARD]: 15 }, 'Rust', 30), { fromLanguage: 20, fromWildcard: 10 });
    assert.deepStrictEqual(planFragmentPayment({ Rust: 50 }, 'Rust', 30), { fromLanguage: 30, fromWildcard: 0 });
  });

  test('not enough even with wildcards', () => {
    assert.strictEqual(planFragmentPayment({ Rust: 20, [WILDCARD]: 5 }, 'Rust', 30), null);
  });

  test('developers without a language are paid only with wildcards', () => {
    assert.ok(needsWildcards('Unknown') && needsWildcards(null));
    assert.deepStrictEqual(planFragmentPayment({ Unknown: 99, [WILDCARD]: 30 }, 'Unknown', 30), { fromLanguage: 0, fromWildcard: 30 });
    assert.strictEqual(planFragmentPayment({ TypeScript: 99 }, null, 30), null);
  });

  test('wildcards bought from a language at the exchange rate', () => {
    assert.strictEqual(maxWildcardsFrom({ Go: WILDCARD_EXCHANGE_RATE * 4 + 2 }, 'Go'), 4);
    assert.strictEqual(maxWildcardsFrom({ [WILDCARD]: 9 }, WILDCARD), 0);
  });
});
