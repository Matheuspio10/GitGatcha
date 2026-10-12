import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getClientIp, normalizeIp, rateLimitKey, secondsUntilWindowEnd, windowStartFor } from './clientKey';

const headers = (h: Record<string, string>) => new Headers(h);

describe('getClientIp', () => {
  test('uses the first x-forwarded-for entry', () => {
    assert.strictEqual(getClientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })), '203.0.113.7');
  });

  test('falls back to x-real-ip', () => {
    assert.strictEqual(getClientIp(headers({ 'x-real-ip': ' 198.51.100.4 ' })), '198.51.100.4');
    assert.strictEqual(getClientIp(headers({ 'x-forwarded-for': ' , ', 'x-real-ip': '198.51.100.4' })), '198.51.100.4');
  });

  test('returns null without usable headers', () => {
    assert.strictEqual(getClientIp(headers({})), null);
    assert.strictEqual(getClientIp(headers({ 'x-forwarded-for': 'unknown' })), null);
    assert.strictEqual(getClientIp(headers({ 'x-forwarded-for': '<script>' })), null);
  });

  test('strips ports and IPv6 brackets', () => {
    assert.strictEqual(normalizeIp('203.0.113.7:51234'), '203.0.113.7');
    assert.strictEqual(normalizeIp('[2001:DB8::1]:443'), '2001:db8::1');
    assert.strictEqual(normalizeIp('2001:db8::1'), '2001:db8::1');
  });
});

describe('rateLimitKey', () => {
  test('prefers the user id when logged in', () => {
    assert.strictEqual(rateLimitKey('forge-search', headers({ 'x-forwarded-for': '1.2.3.4' }), 'u1'), 'forge-search:user:u1');
  });

  test('uses the IP for anonymous calls', () => {
    assert.strictEqual(rateLimitKey('register', headers({ 'x-forwarded-for': '1.2.3.4' })), 'register:ip:1.2.3.4');
    assert.strictEqual(rateLimitKey('register', headers({}), null), 'register:ip:unknown');
  });
});

describe('fixed windows', () => {
  test('window start and remaining seconds', () => {
    const now = Date.UTC(2026, 9, 12, 10, 30, 15, 500);
    assert.strictEqual(windowStartFor(now, 60).toISOString(), '2026-10-12T10:30:00.000Z');
    assert.strictEqual(windowStartFor(now, 3600).toISOString(), '2026-10-12T10:00:00.000Z');
    assert.strictEqual(secondsUntilWindowEnd(now, 60), 45);
    assert.strictEqual(secondsUntilWindowEnd(Date.UTC(2026, 9, 12, 10, 30, 59, 999), 60), 1);
  });
});
