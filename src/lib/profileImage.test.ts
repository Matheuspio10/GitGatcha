import { test, describe } from 'node:test';
import assert from 'node:assert';
import { base64DecodedSize, MAX_AVATAR_BYTES, MAX_BANNER_BYTES, validateProfileImage } from './profileImage';

const dataUrl = (mime: string, bytes: number) => `data:${mime};base64,${Buffer.alloc(bytes, 7).toString('base64')}`;

describe('validateProfileImage', () => {
  test('accepts png/jpeg/webp data URLs within the cap', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
      assert.deepStrictEqual(validateProfileImage(dataUrl(mime, 1000), 'avatar'), { ok: true });
    }
    assert.deepStrictEqual(validateProfileImage(dataUrl('image/webp', MAX_AVATAR_BYTES), 'avatar'), { ok: true });
    assert.deepStrictEqual(validateProfileImage(dataUrl('image/webp', MAX_BANNER_BYTES), 'banner'), { ok: true });
  });

  test('rejects oversized images', () => {
    assert.strictEqual(validateProfileImage(dataUrl('image/webp', MAX_AVATAR_BYTES + 1), 'avatar').ok, false);
    assert.strictEqual(validateProfileImage(dataUrl('image/webp', MAX_BANNER_BYTES + 1), 'banner').ok, false);
  });

  test('rejects other formats, broken base64, external URLs and non-strings', () => {
    assert.strictEqual(validateProfileImage(dataUrl('image/svg+xml', 100), 'avatar').ok, false);
    assert.strictEqual(validateProfileImage(dataUrl('image/gif', 100), 'banner').ok, false);
    assert.strictEqual(validateProfileImage('data:image/png;base64,not base64!', 'avatar').ok, false);
    assert.strictEqual(validateProfileImage('data:image/png;base64,', 'avatar').ok, false);
    assert.strictEqual(validateProfileImage('https://evil.example/pixel.png', 'avatar').ok, false);
    assert.strictEqual(validateProfileImage('javascript:alert(1)', 'banner').ok, false);
    assert.strictEqual(validateProfileImage(42, 'avatar').ok, false);
  });

  test('banner presets and colors', () => {
    assert.deepStrictEqual(validateProfileImage('preset:cyber', 'banner'), { ok: true });
    assert.deepStrictEqual(validateProfileImage('color:#1e1b4b', 'banner'), { ok: true });
    assert.strictEqual(validateProfileImage('preset:unknown', 'banner').ok, false);
    assert.strictEqual(validateProfileImage('color:red', 'banner').ok, false);
    assert.strictEqual(validateProfileImage('color:#1e1b4b;background:url(x)', 'banner').ok, false);
    // Presets/colors are banner-only
    assert.strictEqual(validateProfileImage('preset:cyber', 'avatar').ok, false);
  });

  test('base64DecodedSize', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 1000]) {
      assert.strictEqual(base64DecodedSize(Buffer.alloc(n).toString('base64')), n);
    }
  });
});
