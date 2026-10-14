import { test } from 'node:test';
import assert from 'node:assert';
import { MESSAGES, NAMESPACES } from './messages';

/** "a.b.c" for every leaf string. */
function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

/** {placeholders} used by a message (ICU arguments, plural and select included). */
function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map(m => m[1]))].sort();
}

function leaf(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

test('English and Portuguese have exactly the same keys', () => {
  for (const ns of NAMESPACES) {
    const en = keys(MESSAGES.en[ns]).sort();
    const pt = keys(MESSAGES['pt-BR'][ns]).sort();
    assert.deepStrictEqual(pt.filter(k => !en.includes(k)), [], `${ns}: keys only in pt-BR`);
    assert.deepStrictEqual(en.filter(k => !pt.includes(k)), [], `${ns}: keys missing in pt-BR`);
  }
});

test('translations keep the same placeholders and are never empty', () => {
  for (const ns of NAMESPACES) {
    for (const key of keys(MESSAGES.en[ns]).filter(Boolean)) {
      const en = leaf(MESSAGES.en[ns], key);
      const pt = leaf(MESSAGES['pt-BR'][ns], key);
      assert.strictEqual(typeof en, 'string', `${ns}.${key}`);
      assert.strictEqual(typeof pt, 'string', `${ns}.${key}`);
      assert.ok((pt as string).trim(), `${ns}.${key} is empty in pt-BR`);
      assert.deepStrictEqual(placeholders(pt as string), placeholders(en as string), `${ns}.${key} placeholders`);
    }
  }
});
