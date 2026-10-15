import { test } from 'node:test';
import assert from 'node:assert';
import { RARITY_ORDER } from './rarity';
import { GIFT_DAILY_SEND_LIMIT, GIFT_FEE, GIFT_MIN_LEVEL, giftBlock, giftFee, giftedCopy, startOfUtcDay } from './gifts';

const freeCard = { edition: 'standard', inActiveTeam: false, inPendingChallenge: false };
const sender = { level: GIFT_MIN_LEVEL, sentToday: 0 };

test('every rarity has a fee, and rarer cards cost more to give', () => {
  for (let i = 1; i < RARITY_ORDER.length; i++) {
    assert.ok(GIFT_FEE[RARITY_ORDER[i]] > GIFT_FEE[RARITY_ORDER[i - 1]], RARITY_ORDER[i]);
  }
  assert.strictEqual(giftFee('Unknown rarity'), GIFT_FEE.Common);
});

test('a free standard card can be given', () => {
  assert.strictEqual(giftBlock(freeCard, sender), null);
});

test('the Signature never changes hands', () => {
  assert.strictEqual(giftBlock({ ...freeCard, edition: 'signature' }, sender), 'signature');
});

test('cards the saved team or an open challenge use are blocked', () => {
  assert.strictEqual(giftBlock({ ...freeCard, inActiveTeam: true }, sender), 'activeTeam');
  assert.strictEqual(giftBlock({ ...freeCard, inPendingChallenge: true }, sender), 'pendingChallenge');
});

test('new accounts and the daily limit block the sender', () => {
  assert.strictEqual(giftBlock(freeCard, { level: GIFT_MIN_LEVEL - 1, sentToday: 0 }), 'level');
  assert.strictEqual(giftBlock(freeCard, { level: 50, sentToday: GIFT_DAILY_SEND_LIMIT }), 'dailySendLimit');
  assert.strictEqual(giftBlock(freeCard, { level: 50, sentToday: GIFT_DAILY_SEND_LIMIT - 1 }), null);
});

test('the friend gets the developer, its Shiny and its stamina, nothing earned by the old owner', () => {
  const lastUsedAt = new Date('2026-10-14T10:00:00Z');
  const copy = giftedCopy({ cardId: 'card-1', isShiny: true, stamina: 40, lastUsedAt }, 'friend-1');
  assert.deepStrictEqual(copy, { userId: 'friend-1', cardId: 'card-1', isShiny: true, stamina: 40, lastUsedAt });
  for (const key of ['trainingLevel', 'loyaltyCount', 'loyaltyTier', 'loyaltyMilestones', 'lifetimeStats', 'showcaseOrder', 'inActiveTeam']) {
    assert.ok(!(key in copy), key);
  }
});

test('the daily limits reset at midnight UTC', () => {
  assert.strictEqual(startOfUtcDay(new Date('2026-10-15T23:59:59Z')).toISOString(), '2026-10-15T00:00:00.000Z');
  assert.strictEqual(startOfUtcDay(new Date('2026-10-16T00:00:00Z')).toISOString(), '2026-10-16T00:00:00.000Z');
});
