import { test } from 'node:test';
import assert from 'node:assert';
import { isValidGitHubLogin } from './githubService';

test('isValidGitHubLogin accepts every real login shape, including legacy ones', () => {
  for (const login of ['torvalds', 'Matheuspio10', 'a', 'sindre-sorhus', 'LingDong-', 'old--style', 'x'.repeat(39)]) {
    assert.ok(isValidGitHubLogin(login), login);
  }
});

test('isValidGitHubLogin rejects anything that could change the API path', () => {
  for (const login of ['', '-leading', '../user', 'a/b', 'a.b', 'a?x=1', 'a b', 'x'.repeat(40), 42, null]) {
    assert.ok(!isValidGitHubLogin(login), String(login));
  }
});
