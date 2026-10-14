import { test } from 'node:test';
import assert from 'node:assert';
import { parseStake, takenByAnother } from './challengeService';
import { CHALLENGE_STAKE_MAX } from './battleConfig';

test('stakes are whole BITS from 0 to the cap; empty means no stake', () => {
  assert.strictEqual(parseStake(undefined), 0);
  assert.strictEqual(parseStake(''), 0);
  assert.strictEqual(parseStake(0), 0);
  assert.strictEqual(parseStake(CHALLENGE_STAKE_MAX), CHALLENGE_STAKE_MAX);
  assert.strictEqual(parseStake('150'), 150);
  for (const bad of [-1, 1.5, CHALLENGE_STAKE_MAX + 1, 'abc', NaN]) {
    assert.throws(() => parseStake(bad), /stake/i);
  }
});

test('only an open challenge taken by someone else counts as a lost race', () => {
  assert.strictEqual(takenByAnother({ isOpen: true, defenderId: 'b' }, 'c'), true);
  assert.strictEqual(takenByAnother({ isOpen: true, defenderId: 'b' }, 'b'), false);
  assert.strictEqual(takenByAnother({ isOpen: true, defenderId: null }, 'c'), false);
  assert.strictEqual(takenByAnother({ isOpen: false, defenderId: 'b' }, 'c'), false);
});
