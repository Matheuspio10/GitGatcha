import { test, describe } from 'node:test';
import assert from 'node:assert';
import { pickOpponentTeam, cardPower, OpponentCandidate } from './opponentPicker';

let n = 0;
const c = (rarity: string, primaryLanguage: string | null, power = 300): OpponentCandidate => ({
  id: `card${n++}`, atk: power / 3, def: power / 3, hp: power / 3, rarity, primaryLanguage,
});

// Deterministic PRNG for repeatable tests
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

describe('pickOpponentTeam', () => {
  test('returns 3 distinct cards', () => {
    const pool = [c('Rare', 'Go'), c('Epic', 'Go'), c('Common', 'Go'), c('Rare', 'Go')];
    const team = pickOpponentTeam(pool, 'OPEN', { random: seeded(1) })!;
    assert.strictEqual(team.length, 3);
    assert.strictEqual(new Set(team.map(t => t.id)).size, 3);
  });

  test('Common league only uses Common/Uncommon cards', () => {
    const pool = [c('Legendary', 'Go'), c('Common', 'Go'), c('Epic', 'Go'), c('Uncommon', 'Go'), c('Common', 'Go')];
    for (let seed = 1; seed < 20; seed++) {
      const team = pickOpponentTeam(pool, 'COMMON', { random: seeded(seed) })!;
      assert.ok(team.every(t => t.rarity === 'Common' || t.rarity === 'Uncommon'));
    }
  });

  test('Legendary league only uses Legendary cards, null when not enough', () => {
    const pool = [c('Legendary', 'Go'), c('Legendary', 'Rust'), c('Epic', 'Go')];
    assert.strictEqual(pickOpponentTeam(pool, 'LEGENDARY'), null);
    const team = pickOpponentTeam([...pool, c('Legendary', null)], 'LEGENDARY')!;
    assert.ok(team.every(t => t.rarity === 'Legendary'));
  });

  test('Diversity league picks 3 different known languages', () => {
    const pool = [c('Rare', 'Go'), c('Rare', 'Go'), c('Rare', null), c('Rare', 'Unknown'), c('Rare', 'Rust'), c('Rare', 'Go'), c('Rare', 'CSS')];
    for (let seed = 1; seed < 20; seed++) {
      const team = pickOpponentTeam(pool, 'DIVERSITY', { random: seeded(seed) })!;
      const langs = team.map(t => t.primaryLanguage);
      assert.strictEqual(new Set(langs).size, 3);
      assert.ok(langs.every(l => l && l !== 'Unknown'));
    }
    assert.strictEqual(pickOpponentTeam([c('Rare', 'Go'), c('Rare', 'Go'), c('Rare', 'Rust')], 'DIVERSITY'), null);
  });

  test('Balanced league respects the team power cap', () => {
    const pool = [c('Rare', 'Go', 900), c('Rare', 'Go', 99), c('Rare', 'Go', 201), c('Rare', 'Go', 150), c('Rare', 'Go', 810)];
    for (let seed = 1; seed < 30; seed++) {
      const team = pickOpponentTeam(pool, 'BALANCED', { powerCap: 600, random: seeded(seed) });
      assert.ok(team, `seed ${seed}`);
      assert.ok(team.reduce((a, t) => a + cardPower(t), 0) <= 600);
    }
    assert.strictEqual(pickOpponentTeam(pool, 'BALANCED', { powerCap: 300 }), null);
  });

  test('is not biased to the start of the candidate list', () => {
    const pool = Array.from({ length: 30 }, () => c('Rare', 'Go'));
    const hits = new Map<string, number>();
    const random = seeded(42);
    for (let i = 0; i < 3000; i++) {
      for (const t of pickOpponentTeam(pool, 'OPEN', { random })!) hits.set(t.id, (hits.get(t.id) || 0) + 1);
    }
    // Every card should be picked roughly 3000 * 3 / 30 = 300 times
    assert.strictEqual(hits.size, 30);
    for (const count of hits.values()) assert.ok(count > 200 && count < 400, `count ${count}`);
  });
});
