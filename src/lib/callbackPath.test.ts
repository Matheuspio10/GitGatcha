import { test } from 'node:test';
import assert from 'node:assert';
import { DEFAULT_AFTER_LOGIN, safeCallbackPath } from './callbackPath';

test('after login: the page the proxy sent, kept on this site', () => {
  assert.strictEqual(safeCallbackPath('http://localhost:3000/league?join=K7QM-2XRP'), '/league?join=K7QM-2XRP');
  assert.strictEqual(safeCallbackPath('https://git-gacha.vercel.app/league?tab=groups#x'), '/league?tab=groups#x');
  assert.strictEqual(safeCallbackPath('/collection'), '/collection');
  // Another host keeps only the path: still a page of this site
  assert.strictEqual(safeCallbackPath('https://evil.example/store'), '/store');
  assert.strictEqual(safeCallbackPath('//evil.example/x'), '/x');
  assert.strictEqual(safeCallbackPath('/\\evil.example'), '/');
});

test('after login: nothing usable falls back to the store', () => {
  for (const raw of [null, undefined, '', 'javascript:alert(1)', 'https://a.example//evil.example', '/login?callbackUrl=/store', '/api/user']) {
    assert.strictEqual(safeCallbackPath(raw), DEFAULT_AFTER_LOGIN, String(raw));
  }
});
