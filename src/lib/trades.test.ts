import { test } from 'node:test';
import assert from 'node:assert';
import { GIFT_FEE } from './gifts';
import { TRADE_EXPIRY_HOURS, TRADE_MAX_CARDS, effectiveStatus, tradeExpiry, tradeFee, tradeShapeError } from './trades';

test('each side pays the gift fee of every card it gives', () => {
  assert.strictEqual(tradeFee(['Common', 'Rare']), GIFT_FEE.Common + GIFT_FEE.Rare);
  assert.strictEqual(tradeFee(['Legendary']), GIFT_FEE.Legendary);
  assert.strictEqual(tradeFee([]), 0);
});

test('a trade needs cards on both sides, at most the limit each', () => {
  assert.strictEqual(tradeShapeError(['a'], ['b']), null);
  assert.strictEqual(tradeShapeError([], ['b']), 'emptySide');
  assert.strictEqual(tradeShapeError(['a'], []), 'emptySide');
  const many = Array.from({ length: TRADE_MAX_CARDS + 1 }, (_, i) => `c${i}`);
  assert.strictEqual(tradeShapeError(many, ['x']), 'tooManyCards');
  assert.strictEqual(tradeShapeError(['x'], many), 'tooManyCards');
  assert.strictEqual(tradeShapeError(many.slice(0, TRADE_MAX_CARDS), ['x']), null);
});

test('the same card cannot appear twice in a trade', () => {
  assert.strictEqual(tradeShapeError(['a', 'a'], ['b']), 'duplicateCard');
  assert.strictEqual(tradeShapeError(['a'], ['a']), 'duplicateCard');
});

test('a pending proposal past its expiry reads as expired', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const expiresAt = tradeExpiry(now);
  assert.strictEqual(expiresAt.getTime() - now.getTime(), TRADE_EXPIRY_HOURS * 3600_000);
  assert.strictEqual(effectiveStatus({ status: 'PENDING', expiresAt }, now), 'PENDING');
  assert.strictEqual(effectiveStatus({ status: 'PENDING', expiresAt }, expiresAt), 'EXPIRED');
  assert.strictEqual(effectiveStatus({ status: 'ACCEPTED', expiresAt }, new Date(expiresAt.getTime() + 1)), 'ACCEPTED');
});
