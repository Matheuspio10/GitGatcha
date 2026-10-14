import { test } from 'node:test';
import assert from 'node:assert';
import { CSP_REPORT_PATH, contentSecurityPolicy, parseCspReports, securityHeaders } from './securityHeaders';

function directives(csp: string): Map<string, string[]> {
  return new Map(csp.split('; ').map(part => {
    const [name, ...values] = part.split(' ');
    return [name, values];
  }));
}

test('production policy: no eval, no websockets, nothing framed or embedded', () => {
  const d = directives(contentSecurityPolicy({ dev: false }));
  assert.ok(!d.get('script-src')!.includes("'unsafe-eval'"));
  assert.deepStrictEqual(d.get('connect-src'), ["'self'"]);
  assert.deepStrictEqual(d.get('frame-ancestors'), ["'none'"]);
  assert.deepStrictEqual(d.get('object-src'), ["'none'"]);
  assert.deepStrictEqual(d.get('report-uri'), [CSP_REPORT_PATH]);
});

test('images allow the hosts the game actually uses', () => {
  const img = directives(contentSecurityPolicy({ dev: false })).get('img-src')!;
  for (const host of ['data:', 'https://avatars.githubusercontent.com', 'https://github.com', 'https://*.googleusercontent.com']) {
    assert.ok(img.includes(host), host);
  }
});

test('sign-in redirects to the providers are allowed by form-action', () => {
  const form = directives(contentSecurityPolicy({ dev: false })).get('form-action')!;
  assert.ok(form.includes('https://github.com') && form.includes('https://accounts.google.com'));
});

test('dev adds eval (React Refresh) and the HMR websocket, and skips HSTS', () => {
  const d = directives(contentSecurityPolicy({ dev: true }));
  assert.ok(d.get('script-src')!.includes("'unsafe-eval'"));
  assert.ok(d.get('connect-src')!.includes('ws:'));
  assert.ok(!securityHeaders({ dev: true }).some(h => h.key === 'Strict-Transport-Security'));
  assert.ok(securityHeaders({ dev: false }).some(h => h.key === 'Strict-Transport-Security'));
});

test('the policy is report-only for now', () => {
  const keys = securityHeaders({ dev: false }).map(h => h.key);
  assert.ok(keys.includes('Content-Security-Policy-Report-Only'));
  assert.ok(!keys.includes('Content-Security-Policy'));
});

test('parses both report formats and ignores junk', () => {
  const legacy = { 'csp-report': { 'document-uri': 'https://x/store', 'violated-directive': 'img-src', 'effective-directive': 'img-src', 'blocked-uri': 'https://evil.example/a.png' } };
  const modern = [{ type: 'csp-violation', body: { documentURL: 'https://x/forge', effectiveDirective: 'script-src-elem', blockedURL: 'inline', sourceFile: 'https://x/a.js' } }, { type: 'deprecation', body: {} }];
  assert.deepStrictEqual(parseCspReports(legacy), [{ directive: 'img-src', blocked: 'https://evil.example/a.png', page: 'https://x/store', source: undefined }]);
  assert.deepStrictEqual(parseCspReports(modern), [{ directive: 'script-src-elem', blocked: 'inline', page: 'https://x/forge', source: 'https://x/a.js' }]);
  for (const junk of [null, 'text', 42, {}, [{}], { 'csp-report': 'x' }]) assert.deepStrictEqual(parseCspReports(junk), []);
});
