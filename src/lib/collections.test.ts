import { test } from 'node:test';
import assert from 'node:assert';
import { COMBAT_LANGUAGES } from './battleConfig';
import { RARITY_ORDER } from './rarity';
import {
  COLLECTION_LANGUAGES,
  FRAMES,
  TITLES,
  collectionProgress,
  cosmeticContext,
  frameById,
  publicFrame,
  titleById,
  unlockedFrames,
  unlockedTitles,
} from './collections';

const card = (primaryLanguage: string | null, rarity: string) => ({ primaryLanguage, rarity });
const fullSet = (lang: string) => RARITY_ORDER.map(r => card(lang, r));

test('one set per combat language, each with a slot per rarity', () => {
  assert.deepStrictEqual([...COLLECTION_LANGUAGES], [...COMBAT_LANGUAGES]);
  const progress = collectionProgress([]);
  assert.strictEqual(progress.length, COLLECTION_LANGUAGES.length);
  assert.ok(progress.every(p => p.share === 0 && !p.complete));
});

test('a set is complete with one card of every rarity, duplicates of a rarity do not count twice', () => {
  const progress = collectionProgress([...fullSet('Rust'), card('Go', 'Rare'), card('Go', 'Rare'), card('Go', 'Epic')]);
  const rust = progress.find(p => p.language === 'Rust')!;
  const go = progress.find(p => p.language === 'Go')!;
  assert.ok(rust.complete);
  assert.strictEqual(rust.share, 1);
  assert.deepStrictEqual(go.owned, ['Rare', 'Epic']);
  assert.strictEqual(go.share, 2 / 5);
  assert.ok(!go.complete);
});

test('cards of other languages or no language never fill a set', () => {
  const progress = collectionProgress([...fullSet('Lua'), card(null, 'Legendary'), card('Unknown', 'Rare')]);
  assert.ok(progress.every(p => p.owned.length === 0));
});

test('levels and completed sets unlock titles and frames', () => {
  const none = cosmeticContext(1, collectionProgress([]));
  assert.strictEqual(unlockedTitles(none).length, 0);
  assert.strictEqual(unlockedFrames(none).length, 0);

  const ctx = cosmeticContext(12, collectionProgress([...fullSet('Python'), ...fullSet('Rust'), ...fullSet('Go')]));
  const titles = unlockedTitles(ctx).map(t => t.id);
  assert.ok(titles.includes('lvl-10') && !titles.includes('lvl-25'));
  assert.ok(titles.includes('sets-1') && titles.includes('sets-3') && !titles.includes('sets-10'));
  assert.ok(titles.includes('set-Python') && titles.includes('set-Rust') && !titles.includes('set-Java'));
  const frames = unlockedFrames(ctx).map(f => f.id);
  assert.deepStrictEqual(frames.sort(), ['bronze', 'silver', 'spectrum'].sort());
});

test('ids are unique and unknown ids resolve to nothing', () => {
  assert.strictEqual(new Set(TITLES.map(t => t.id)).size, TITLES.length);
  assert.strictEqual(new Set(FRAMES.map(f => f.id)).size, FRAMES.length);
  assert.strictEqual(titleById('nope'), null);
  assert.strictEqual(frameById(null), null);
  assert.strictEqual(titleById('set-Rust')?.label, 'Rust Collector');
});

test('the public view of a frame drops the unlock rule', () => {
  const frame = publicFrame(frameById('holo'));
  assert.ok(frame && !('unlocked' in frame) && frame.animated);
});
