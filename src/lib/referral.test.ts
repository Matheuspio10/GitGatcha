import { test } from 'node:test';
import assert from 'node:assert';
import { REFERRAL_CAP, inviteLink, normalizeReferralCode, referrerStillPaid } from './referral';

test('invite codes are usernames; junk is ignored', () => {
  assert.strictEqual(normalizeReferralCode(' @MatheusPio '), 'MatheusPio');
  assert.strictEqual(normalizeReferralCode('ab'), null);
  assert.strictEqual(normalizeReferralCode('a b c'), null);
  assert.strictEqual(normalizeReferralCode("x'; DROP TABLE"), null);
  assert.strictEqual(normalizeReferralCode(42), null);
});

test('the referrer is paid for at most REFERRAL_CAP referrals', () => {
  assert.strictEqual(referrerStillPaid(0), true);
  assert.strictEqual(referrerStillPaid(REFERRAL_CAP - 1), true);
  assert.strictEqual(referrerStillPaid(REFERRAL_CAP), false);
});

test('invite link points to the free pack', () => {
  assert.strictEqual(inviteLink('https://x.app', 'a b'), 'https://x.app/try?ref=a%20b');
});
