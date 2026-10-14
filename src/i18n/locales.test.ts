import { test } from 'node:test';
import assert from 'node:assert';
import { pickLocale } from './locales';

test('a valid cookie wins over the browser', () => {
  assert.strictEqual(pickLocale('pt-BR', 'en-US,en;q=0.9'), 'pt-BR');
  assert.strictEqual(pickLocale('en', 'pt-BR'), 'en');
});

test('without a cookie, the best supported browser language is used', () => {
  assert.strictEqual(pickLocale(undefined, 'pt-BR,pt;q=0.9,en;q=0.8'), 'pt-BR');
  assert.strictEqual(pickLocale(undefined, 'pt-PT'), 'pt-BR');
  assert.strictEqual(pickLocale(undefined, 'fr-FR,pt;q=0.5,en;q=0.9'), 'en');
  assert.strictEqual(pickLocale(undefined, 'de-DE'), 'en');
  assert.strictEqual(pickLocale('xx', null), 'en');
});
