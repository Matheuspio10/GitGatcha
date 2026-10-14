import { test } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { idSchema, isApiErrorCode, parseBody } from './validation';

const schema = z.object({
  cardId: idSchema,
  bio: z.string().max(5, { error: 'profile.bioTooLong' }).optional(),
  image: z.string({ error: 'profile.avatar.invalid' }).nullable().optional(),
});

test('a valid body comes back parsed (strings trimmed, unknown keys dropped)', () => {
  const result = parseBody({ cardId: '  abc ', extra: 1 }, schema);
  assert.deepStrictEqual(result, { ok: true, data: { cardId: 'abc' } });
});

test('a missing or non-JSON body is a generic invalid request', () => {
  for (const raw of [undefined, null, 'text', 42, []]) {
    const result = parseBody(raw, schema);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'common.invalidRequest');
  }
});

test('a check can name its message key, with {max}/{min} filled in', () => {
  const result = parseBody({ cardId: 'a', bio: 'too long' }, schema);
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.code, 'profile.bioTooLong');
    assert.deepStrictEqual(result.values, { max: 5 });
    assert.deepStrictEqual(result.issues, ['bio: too_big']);
  }
});

test('a wrong type under nullable/optional still reports the named key', () => {
  const result = parseBody({ cardId: 'a', image: 12 }, schema);
  assert.strictEqual(result.ok, false);
  if (!result.ok) assert.strictEqual(result.code, 'profile.avatar.invalid');
});

test('ids are bounded and never empty', () => {
  assert.strictEqual(parseBody({ cardId: '   ' }, schema).ok, false);
  assert.strictEqual(parseBody({ cardId: 'x'.repeat(101) }, schema).ok, false);
});

test('isApiErrorCode only accepts leaf keys of apiErrors', () => {
  assert.ok(isApiErrorCode('common.notEnoughBits'));
  assert.ok(isApiErrorCode('profile.avatar.invalid'));
  assert.ok(!isApiErrorCode('common'));
  assert.ok(!isApiErrorCode('Invalid input: expected string'));
  assert.ok(!isApiErrorCode(undefined));
});
