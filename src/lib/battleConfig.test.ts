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

test('combat languages: required passives exist and the type chart is coherent', async () => {
  const { COMBAT_LANGUAGES, TYPE_ADVANTAGES, typeWeaknesses, defMitigation, MAX_DEF_MITIGATION } = await import('./battleConfig');
  for (const lang of ['Java', 'C#', 'Kotlin', 'Swift', 'Shell', 'HTML', 'PHP', 'Dart', 'Jupyter Notebook']) {
    assert.ok((COMBAT_LANGUAGES as readonly string[]).includes(lang), `${lang} has no combat type`);
  }
  for (const [att, targets] of Object.entries(TYPE_ADVANTAGES)) {
    for (const t of targets ?? []) {
      assert.ok((COMBAT_LANGUAGES as readonly string[]).includes(t), `${att} beats unknown ${t}`);
      assert.ok(!TYPE_ADVANTAGES[t]?.includes(att as never), `${att} and ${t} beat each other`);
    }
  }
  // Every typed language beats something; everything but TypeScript/CSS also loses to something
  for (const lang of COMBAT_LANGUAGES) {
    if (lang !== 'CSS') assert.ok((TYPE_ADVANTAGES[lang] ?? []).length > 0, `${lang} beats nothing`);
    if (lang !== 'TypeScript' && lang !== 'CSS') assert.ok(typeWeaknesses(lang).length > 0, `${lang} has no weakness`);
  }
  assert.strictEqual(defMitigation(0), 0);
  assert.strictEqual(defMitigation(100), 0.5);
  assert.strictEqual(defMitigation(1e9), MAX_DEF_MITIGATION);
});
