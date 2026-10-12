import { test, describe } from 'node:test';
import assert from 'node:assert';
import { resolve3v3Battle, decideBattleWinner, remainingHpFraction, BattleCard } from './battleResolver';

function card(id: string, over: Partial<BattleCard> = {}): BattleCard {
  return {
    id, name: id, atk: 50, def: 0, hp: 100, maxHp: 100, stamina: 100,
    rarity: 'Rare', primaryLanguage: null, type: 'Neutral', ...over,
  };
}

describe('decideBattleWinner (single tie rule)', () => {
  test('the side with cards left wins', () => {
    const c = [card('c1', { hp: 0 }), card('c2', { hp: 10 }), card('c3')];
    const d = [card('d1', { hp: 0 }), card('d2', { hp: 0 }), card('d3', { hp: 0 })];
    assert.strictEqual(decideBattleWinner(c, d, 1, 3), 'CHALLENGER');
    assert.strictEqual(decideBattleWinner(d, c, 3, 1), 'DEFENDER');
  });

  test('both standing (turn limit): higher remaining HP % wins', () => {
    const c = [card('c1', { hp: 0 }), card('c2', { hp: 50 }), card('c3')];
    const d = [card('d1', { hp: 0 }), card('d2', { hp: 0 }), card('d3', { hp: 90 })];
    assert.strictEqual(decideBattleWinner(c, d, 1, 2), 'CHALLENGER');
    assert.strictEqual(decideBattleWinner(d, c, 2, 1), 'DEFENDER');
  });

  test('exact tie goes to the defender, whether both are out or both standing', () => {
    const out = () => [card('a', { hp: -5 }), card('b', { hp: 0 }), card('c', { hp: -1 })];
    assert.strictEqual(decideBattleWinner(out(), out(), 3, 3), 'DEFENDER');
    const standing = () => [card('a', { hp: 0 }), card('b', { hp: 40 }), card('c')];
    assert.strictEqual(decideBattleWinner(standing(), standing(), 1, 1), 'DEFENDER');
  });

  test('remainingHpFraction ignores overkill and overheal', () => {
    assert.strictEqual(remainingHpFraction([card('a', { hp: -50 }), card('b', { hp: 150 })]), 0.5);
  });
});

describe('resolve3v3Battle end conditions', () => {
  test('mirror match that ends in a double KO goes to the defender', () => {
    const team = (p: string) => [card(`${p}1`), card(`${p}2`), card(`${p}3`)];
    const result = resolve3v3Battle(team('c'), team('d'));
    assert.strictEqual(result.winner, 'DEFENDER');
    assert.ok(result.log.some(t => t.events.some(e => e.message.includes('Double KO'))));
  });

  test('turn limit is decided by remaining HP %, not automatically for the challenger', () => {
    // Huge HP: every matchup hits the 50-turn cap and the global limit stops the
    // fight with both teams standing. The defender (harder hitter) has more HP left.
    const tank = (id: string, atk: number) => card(id, { atk, hp: 100000, maxHp: 100000 });
    const c = [tank('c1', 9), tank('c2', 9), tank('c3', 9)];
    const d = [tank('d1', 10), tank('d2', 10), tank('d3', 10)];
    const result = resolve3v3Battle(c, d);
    assert.ok(result.log.some(t => t.events.some(e => e.message === 'Turn Limit Reached!')));
    assert.strictEqual(result.winner, 'DEFENDER');
  });

  test('a clearly stronger team still wins normally', () => {
    const c = [card('c1', { atk: 500 }), card('c2', { atk: 500 }), card('c3', { atk: 500 })];
    const d = [card('d1', { atk: 5 }), card('d2', { atk: 5 }), card('d3', { atk: 5 })];
    assert.strictEqual(resolve3v3Battle(c, d).winner, 'CHALLENGER');
  });
});
