import { test } from 'node:test';
import assert from 'node:assert';
import { cardTitle, DevProfile, serialHash } from './cardVisuals';

const NOW = Date.UTC(2026, 9, 17);
const yearsAgo = (y: number) => new Date(NOW - y * 365.25 * 24 * 3600 * 1000);
const profile = (p: Partial<DevProfile>): DevProfile => ({
  followers: 0, totalStars: 0, totalForks: 0, topRepoStars: 0, publicRepos: 5, publicGists: 0, languageCount: 1,
  githubCreatedAt: yearsAgo(3),
  ...p,
});
const titleOf = (p: Partial<DevProfile>, lang = 'Rust', login = 'someone') => cardTitle(profile(p), lang, 'Rare', login, NOW).title;

test('cards without a profile snapshot keep the language + rank title', () => {
  assert.deepStrictEqual(cardTitle(null, 'Rust', 'Rare', 'x', NOW), { title: 'Rust Engineer', reason: null });
  assert.strictEqual(cardTitle({ followers: 10 }, 'C', 'Legendary', 'x', NOW).title, 'C Overlord');
  assert.strictEqual(cardTitle(undefined, 'Unknown', 'Common', 'x', NOW).title, 'Dev Rookie');
});

test('the strongest real trait names the card', () => {
  assert.strictEqual(titleOf({ totalStars: 230_000, topRepoStars: 120_000, followers: 280_000 }), 'Galaxy Brain');
  assert.strictEqual(titleOf({ totalStars: 13_000, topRepoStars: 12_000 }), 'Flagship Builder');
  assert.strictEqual(titleOf({ totalStars: 2_400, topRepoStars: 2_300 }), 'One-Hit Wonder');
  assert.strictEqual(titleOf({ totalStars: 210_000, topRepoStars: 190_000, followers: 280_000 }), 'Magnum Opus');
  assert.strictEqual(titleOf({ publicRepos: 290, totalStars: 2_000 }), 'Repo Hoarder');
  assert.strictEqual(titleOf({ followers: 1_500, totalStars: 300 }), 'Influencer');
  assert.strictEqual(titleOf({ languageCount: 11 }), 'Polyglot');
  assert.strictEqual(titleOf({ publicGists: 60 }), 'Copy-Paste Artisan');
  assert.strictEqual(titleOf({ totalForks: 600, totalStars: 900 }), 'Fork Magnet');
});

test('account age only names really old accounts (14+ years) when nothing else stands out', () => {
  assert.strictEqual(titleOf({ githubCreatedAt: yearsAgo(15) }), 'Pre-Cloud Elder');
  assert.strictEqual(titleOf({ githubCreatedAt: yearsAgo(17.5) }), 'Remembers SVN');
  assert.strictEqual(cardTitle(profile({ githubCreatedAt: yearsAgo(12) }), 'Go', 'Common', 'x', NOW).reason, 'a quiet GitHub profile');
  assert.strictEqual(cardTitle(profile({ githubCreatedAt: yearsAgo(7) }), 'Go', 'Common', 'x', NOW).reason, 'a quiet GitHub profile');
  assert.strictEqual(titleOf({ githubCreatedAt: yearsAgo(16), totalStars: 20_000 }), 'Supernova');
  assert.strictEqual(titleOf({ githubCreatedAt: yearsAgo(11), publicRepos: 120, totalStars: 900 }), 'Serial Starter');
});

test('funny combinations beat modest fame, not real fame', () => {
  assert.strictEqual(titleOf({ publicRepos: 120, totalStars: 12 }), 'Side Project Graveyard');
  assert.strictEqual(titleOf({ totalForks: 340, totalStars: 90 }), 'Fork Bomb');
  assert.strictEqual(titleOf({ followers: 800, totalStars: 4 }), 'Social Butterfly');
  assert.strictEqual(titleOf({ githubCreatedAt: yearsAgo(13), publicRepos: 1 }), 'Ancient Lurker');
  assert.strictEqual(titleOf({ publicRepos: 120, totalStars: 12, followers: 15_000 }), 'Icon');
});

test('quiet profiles get a stable joke, newcomers a fresh commit', () => {
  assert.strictEqual(titleOf({ githubCreatedAt: yearsAgo(0.3) }), 'Fresh Commit');
  assert.strictEqual(titleOf({}, 'Rust', 'ferris'), titleOf({}, 'Rust', 'ferris'), 'same dev, same joke');
  const pool = new Set(Array.from({ length: 60 }, (_, i) => titleOf({}, 'Rust', `dev${i}`)));
  assert.ok(pool.has('Borrow Checker Victim') && pool.has('Works On My Machine'), [...pool].join(', '));
  assert.strictEqual(cardTitle(profile({}), 'Go', 'Common', 'x', NOW).reason, 'a quiet GitHub profile');
});

test('the title explains itself', () => {
  assert.deepStrictEqual(cardTitle(profile({ totalStars: 48_200 }), 'C', 'Epic', 'x', NOW), { title: 'Supernova', reason: '48k stars' });
  assert.deepStrictEqual(cardTitle(profile({ followers: 1_250, totalStars: 400 }), 'C', 'Epic', 'x', NOW), { title: 'Influencer', reason: '1.3k followers' });
});

test('serial hash is stable and case-insensitive', () => {
  assert.strictEqual(serialHash('Torvalds'), serialHash('torvalds'));
  assert.match(serialHash('torvalds'), /^[0-9a-f]{7}$/);
});
