import { test } from 'node:test';
import assert from 'node:assert';
import { INVOCATION_COSTS } from './forgeService';
import { ALL_PACKS, EVENT_PACKS, activeEventPack, getPackById, storePacks } from './packDefinitions';
import { WEEKLY_SPRINT_FAMILIES, sprintPeriod } from './sprints';
import {
  EVENT_PACK_COST,
  EVENT_PACK_MIN_RARITY,
  FEATURED_DEV_MIN_RARITY,
  activeEventPackId,
  featuredDevRarities,
  featuredInvocationCost,
  forgeCostFor,
  isEventPackId,
  isFeaturedDev,
  upcomingEventPackIds,
} from './weeklyEvents';

test('every Weekly Sprint theme has its own event pack, filtered by the theme languages', () => {
  assert.strictEqual(EVENT_PACKS.length, WEEKLY_SPRINT_FAMILIES.length);
  for (const family of WEEKLY_SPRINT_FAMILIES) {
    const pack = EVENT_PACKS.find(p => p.name === `${family.name} Pack`);
    assert.ok(pack, family.id);
    assert.deepStrictEqual(pack.pool, { languages: family.languages });
    assert.strictEqual(pack.category, 'event');
    assert.strictEqual(pack.cost, EVENT_PACK_COST);
    assert.strictEqual(pack.guaranteedMinRarity, EVENT_PACK_MIN_RARITY);
    assert.ok(isEventPackId(pack.id));
  }
  assert.strictEqual(new Set(EVENT_PACKS.map(p => p.id)).size, EVENT_PACKS.length);
});

test('event pack ids never clash with the regular catalog, which stays event-free', () => {
  for (const pack of ALL_PACKS) {
    assert.ok(!isEventPackId(pack.id), pack.id);
    assert.notStrictEqual(pack.category, 'event');
  }
});

test('the store sells exactly the event pack of the running Weekly Sprint', () => {
  const now = new Date('2026-10-14T10:00:00Z');
  const theme = sprintPeriod('weekly', now).theme;
  const onSale = storePacks(now).filter(p => p.category === 'event');
  assert.strictEqual(onSale.length, 1);
  assert.strictEqual(onSale[0].id, activeEventPackId(now));
  assert.deepStrictEqual(onSale[0].pool.languages, theme.languages);
  assert.strictEqual(activeEventPack(now).id, onSale[0].id);
});

test('the event pack changes with the week and is the same all week long', () => {
  const monday = new Date('2026-10-12T00:00:00Z');
  const sunday = new Date('2026-10-18T23:59:59Z');
  const nextMonday = new Date('2026-10-19T00:00:00Z');
  assert.strictEqual(activeEventPackId(monday), activeEventPackId(sunday));
  assert.notStrictEqual(activeEventPackId(sunday), activeEventPackId(nextMonday));
  assert.deepStrictEqual(upcomingEventPackIds(sunday), [activeEventPackId(sunday), activeEventPackId(nextMonday)]);
});

test('an event pack bought in an earlier week can still be found to open it', () => {
  for (const pack of EVENT_PACKS) assert.strictEqual(getPackById(pack.id), pack);
});

test('the Dev of the Week costs less at the Forge, never nothing', () => {
  for (const [rarity, cost] of Object.entries(INVOCATION_COSTS)) {
    const discounted = forgeCostFor(rarity, true);
    assert.ok(discounted.fragments < cost.fragments && discounted.fragments > 0, rarity);
    assert.ok(discounted.bits < cost.bits && discounted.bits > 0, rarity);
    assert.deepStrictEqual(forgeCostFor(rarity, false), cost);
  }
  assert.deepStrictEqual(featuredInvocationCost({ fragments: 3, bits: 5 }), { fragments: 2, bits: 3 });
});

test('the Dev of the Week matches its login in any case, and only it', () => {
  assert.ok(isFeaturedDev('Torvalds', 'torvalds'));
  assert.ok(!isFeaturedDev('gaearon', 'torvalds'));
  assert.ok(!isFeaturedDev('torvalds', null));
});

test('the Dev of the Week is drawn from the minimum rarity up', () => {
  const rarities = featuredDevRarities();
  assert.strictEqual(rarities[0], FEATURED_DEV_MIN_RARITY);
  assert.strictEqual(rarities[rarities.length - 1], 'Legendary');
});
