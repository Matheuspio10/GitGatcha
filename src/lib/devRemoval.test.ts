import { test } from 'node:test';
import assert from 'node:assert';
import {
  ANONYMOUS_DEV_AVATAR, ANONYMOUS_DEV_NAME, anonymizedCardData, githubIdFromAvatar, isAnonymousLogin, isRemovedDev, scrubBattle,
} from './devRemoval';

const removed = { logins: new Set(['octo-dev']), ids: new Set([4242]) };

test('dev removal: a developer who left is recognised by login (any case) or by GitHub id after a rename', () => {
  assert.strictEqual(isRemovedDev({ githubUsername: 'Octo-Dev' }, removed), true);
  assert.strictEqual(isRemovedDev({ githubUsername: 'new-name', avatarUrl: 'https://avatars.githubusercontent.com/u/4242?v=4' }, removed), true);
  assert.strictEqual(isRemovedDev({ githubUsername: 'someone', avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4' }, removed), false);
  assert.strictEqual(isRemovedDev({ githubUsername: 'someone', avatarUrl: null }, removed), false);
  assert.strictEqual(githubIdFromAvatar('https://github.com/x.png'), null);
});

test('dev removal: the anonymized card keeps nothing that identifies the developer', () => {
  const data = anonymizedCardData('card-1');
  assert.strictEqual(data.name, ANONYMOUS_DEV_NAME);
  assert.strictEqual(data.avatarUrl, ANONYMOUS_DEV_AVATAR);
  assert.ok(isAnonymousLogin(data.githubUsername));
  assert.ok(!/^[a-z\d-]+$/i.test(data.githubUsername), 'must not be a valid GitHub login (it would link to someone else)');
  for (const k of ['followers', 'totalStars', 'totalForks', 'topRepoStars', 'publicRepos', 'publicGists', 'languageCount', 'githubCreatedAt'] as const) {
    assert.strictEqual(data[k], null, k);
  }
  assert.ok(!('atk' in data) && !('rarity' in data) && !('primaryLanguage' in data), 'stats, rarity and language stay');
  assert.strictEqual(isAnonymousLogin('torvalds'), false);
});

test('dev removal: battles lose the name and photo, in teams, stats and log', () => {
  const avatar = 'https://avatars.githubusercontent.com/u/4242?v=4';
  const battle = {
    challengerTeam: [{ id: 'uc1', name: 'Octo Dev', avatarUrl: avatar, atk: 50 }, { id: 'uc2', name: 'Other', avatarUrl: 'x' }],
    defenderTeam: [{ id: 'c9', name: 'Rival', avatarUrl: 'y' }],
    battleStats: [{ name: 'Octo Dev', cardId: 'uc1', damageDealt: 10 }, { name: 'Rival', cardId: 'c9' }],
    log: [{ events: [
      { key: 'damage', message: 'Octo Dev dealt 10 damage.', values: { name: 'Octo Dev', dmg: 10 } },
      { key: 'enterField', message: 'Rival enters the field!', values: { name: 'Rival' } },
    ] }],
  };
  const clean = scrubBattle(battle, { name: 'Octo Dev', avatarUrl: avatar });
  assert.ok(clean);
  assert.deepStrictEqual(clean.challengerTeam, [
    { id: 'uc1', name: ANONYMOUS_DEV_NAME, avatarUrl: ANONYMOUS_DEV_AVATAR, atk: 50 },
    { id: 'uc2', name: 'Other', avatarUrl: 'x' },
  ]);
  assert.deepStrictEqual(clean.defenderTeam, battle.defenderTeam);
  assert.deepStrictEqual(clean.battleStats, [{ name: ANONYMOUS_DEV_NAME, cardId: 'uc1', damageDealt: 10 }, { name: 'Rival', cardId: 'c9' }]);
  assert.deepStrictEqual(clean.log, [{ events: [
    { key: 'damage', message: `${ANONYMOUS_DEV_NAME} dealt 10 damage.`, values: { name: ANONYMOUS_DEV_NAME, dmg: 10 } },
    { key: 'enterField', message: 'Rival enters the field!', values: { name: 'Rival' } },
  ] }]);
  assert.strictEqual(JSON.stringify(clean).includes('Octo Dev'), false);
  assert.strictEqual(JSON.stringify(clean).includes(avatar), false);
});

test('dev removal: a battle without the developer is left alone', () => {
  const battle = { challengerTeam: [{ name: 'Octo Dev', avatarUrl: 'other-avatar' }], defenderTeam: [], battleStats: null, log: null };
  // Same display name, different person (avatar differs): not touched
  assert.strictEqual(scrubBattle(battle, { name: 'Octo Dev', avatarUrl: 'https://avatars.githubusercontent.com/u/4242?v=4' }), null);
});
