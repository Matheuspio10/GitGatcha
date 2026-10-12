import { test } from 'node:test';
import assert from 'node:assert';
import { LEAGUES, LEAGUE_MODES, getLeagueRewards } from './battleConfig';

test('every league pays more on a win than it costs to enter', () => {
  for (const mode of LEAGUE_MODES) {
    const l = LEAGUES[mode];
    assert.ok(l.winBits - l.entryFee > 0, `${mode} win is not net positive`);
    assert.ok(l.lossBits <= l.winBits, `${mode} pays more on a loss`);
  }
});

test('Legendary league: 500 entry, 900 on a win, nothing on a loss', () => {
  assert.strictEqual(LEAGUES.LEGENDARY.entryFee, 500);
  assert.deepStrictEqual(getLeagueRewards('LEGENDARY', true), { bits: 900, xp: 200 });
  assert.strictEqual(getLeagueRewards('LEGENDARY', false).bits, 0);
});

test('unknown leagues fall back to the Open League table', () => {
  assert.deepStrictEqual(getLeagueRewards('NOPE', true), getLeagueRewards('OPEN', true));
  assert.deepStrictEqual(getLeagueRewards('OPEN', false), { bits: 10, xp: 30 });
});
