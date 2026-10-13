import { test } from 'node:test';
import assert from 'node:assert';
import { TOWER_FLOORS, TOWER_THEMES, compareTowerRuns, seededPick, themeForWeek } from './tower';
import { RARITY_ORDER } from './rarity';

test('floors get harder and the bosses pay the most', () => {
  const power = (f: (typeof TOWER_FLOORS)[number]) => f.rarities.reduce((s, r) => s + RARITY_ORDER.indexOf(r), 0);
  for (let i = 1; i < TOWER_FLOORS.length; i++) assert.ok(power(TOWER_FLOORS[i]) > power(TOWER_FLOORS[i - 1]));
  const top = Math.max(...TOWER_FLOORS.map(f => f.rewardBits));
  assert.strictEqual(TOWER_FLOORS.find(f => f.rewardBits === top)?.boss, 'final');
});

test('the same seed always picks the same opponents', () => {
  const items = Array.from({ length: 50 }, (_, i) => `card-${i}`);
  assert.deepStrictEqual(seededPick(items, 3, '2026-10-12|4'), seededPick(items, 3, '2026-10-12|4'));
  assert.notDeepStrictEqual(seededPick(items, 3, '2026-10-12|4'), seededPick(items, 3, '2026-10-12|5'));
  assert.strictEqual(new Set(seededPick(items, 10, 'x')).size, 10);
});

test('each week has a theme and consecutive weeks differ', () => {
  const week = new Date('2026-10-12T00:00:00Z');
  const next = new Date(week.getTime() + 7 * 24 * 3600 * 1000);
  assert.ok((TOWER_THEMES as readonly string[]).includes(themeForWeek(week)));
  assert.notStrictEqual(themeForWeek(week), themeForWeek(next));
});

test('ranking: higher floor, then fewer attempts, then earlier', () => {
  const t = (s: string) => new Date(s);
  const runs = [
    { id: 'a', cleared: 5, attempts: 9, updatedAt: t('2026-10-13') },
    { id: 'b', cleared: 7, attempts: 20, updatedAt: t('2026-10-14') },
    { id: 'c', cleared: 5, attempts: 6, updatedAt: t('2026-10-15') },
    { id: 'd', cleared: 5, attempts: 6, updatedAt: t('2026-10-12') },
  ];
  assert.deepStrictEqual([...runs].sort(compareTowerRuns).map(r => r.id), ['b', 'd', 'c', 'a']);
});
