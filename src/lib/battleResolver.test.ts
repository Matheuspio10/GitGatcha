import { test, describe } from 'node:test';
import assert from 'node:assert';
import { resolve3v3Battle, decideBattleWinner, remainingHpFraction, BattleCard, getCardType } from './battleResolver';

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

describe('combat formula and passives', () => {
  const lone = (over: Partial<BattleCard>) => [card('x1', over), card('x2', { hp: 1, maxHp: 1 }), card('x3', { hp: 1, maxHp: 1 })];
  const firstHit = (c: BattleCard[], d: BattleCard[]) => {
    const turn = resolve3v3Battle(c, d, { rng: () => 0.99 }).log.find(t => t.turnNumber === 1)!;
    return turn.events.filter(e => e.type === 'damage').map(e => ({ from: e.cardId, value: e.value }));
  };

  test('DEF mitigates a percentage: 100 DEF halves the damage', () => {
    const hits = firstHit(lone({ atk: 80 }), lone({ def: 100, hp: 1000, maxHp: 1000 }));
    assert.deepStrictEqual(hits.find(h => h.from === 'x1')?.value, 40);
  });

  test('new languages get a combat type; others stay Neutral', () => {
    assert.strictEqual(getCardType({ primaryLanguage: 'Java', rarity: 'Rare' }), 'Java');
    assert.strictEqual(getCardType({ primaryLanguage: 'Jupyter Notebook', rarity: 'Rare' }), 'Jupyter Notebook');
    assert.strictEqual(getCardType({ primaryLanguage: 'Haskell', rarity: 'Rare' }), 'Neutral');
    assert.strictEqual(getCardType({ primaryLanguage: null, rarity: 'Rare' }), 'Neutral');
  });

  test('Kotlin Null Safety caps a single turn at 30% of max HP', () => {
    const hits = firstHit(lone({ atk: 900 }), lone({ type: 'Kotlin', primaryLanguage: 'Kotlin', hp: 1000, maxHp: 1000 }));
    assert.strictEqual(hits.find(h => h.from === 'x1')?.value, 300);
  });

  test('PHP @ Error Suppression survives one knockout at 1 HP', () => {
    const result = resolve3v3Battle(lone({ atk: 5000 }), lone({ type: 'PHP', primaryLanguage: 'PHP', atk: 1 }), { rng: () => 0.99 });
    assert.ok(result.log.some(t => t.events.some(e => e.message.includes('@-suppressed'))));
  });

  test('CSS zero-damage chance shrinks with rarity', () => {
    // rng 0.5 skips double damage (< 0.3·mult); with Common 0.9 → zero chance 0.111, Legendary → 0.091
    let roll = 0;
    const rolls = [0.5, 0.1];
    const zeroed = (rarity: BattleCard['rarity']) => {
      roll = 0;
      const turn = resolve3v3Battle(lone({ type: 'CSS', primaryLanguage: 'CSS', rarity }), lone({ hp: 1000, maxHp: 1000 }), { rng: () => rolls[roll++ % 2] })
        .log.find(t => t.turnNumber === 1)!;
      return turn.events.some(e => e.message.includes('undefined behavior'));
    };
    assert.strictEqual(zeroed('Common'), true);
    assert.strictEqual(zeroed('Legendary'), false);
  });
});

describe('entry passives (Go First Strike × Rust Iron Shield)', () => {
  const go = (id: string) => card(id, { type: 'Go', primaryLanguage: 'Go' });
  const rust = (id: string) => card(id, { type: 'Rust', primaryLanguage: 'Rust' });
  const filler = (id: string) => card(id, { atk: 1, hp: 1000, maxHp: 1000 });
  const firstTurn = (log: ReturnType<typeof resolve3v3Battle>['log']) =>
    log.find(t => t.events.some(e => e.type === 'enter_field'))!;

  test('the shield blocks the First Strike whichever side the Rust card is on', () => {
    const asDefender = firstTurn(resolve3v3Battle([go('g'), filler('c2'), filler('c3')], [rust('r'), filler('d2'), filler('d3')]).log);
    const asChallenger = firstTurn(resolve3v3Battle([rust('r'), filler('c2'), filler('c3')], [go('g'), filler('d2'), filler('d3')]).log);
    assert.strictEqual(asDefender.dHpEnd, 100);
    assert.strictEqual(asChallenger.cHpEnd, 100);
    for (const turn of [asDefender, asChallenger]) {
      assert.ok(turn.events.some(e => e.message === 'Iron Shield blocked First Strike!'));
    }
  });

  test('two Go cards entering together hit each other at the same time', () => {
    const result = resolve3v3Battle(
      [card('g1', { type: 'Go', atk: 200 }), filler('c2'), filler('c3')],
      [card('g2', { type: 'Go', atk: 200 }), filler('d2'), filler('d3')],
    );
    const turn = firstTurn(result.log);
    assert.strictEqual(turn.cHpEnd, 0);
    assert.strictEqual(turn.dHpEnd, 0);
  });

  test('the shield only lasts for the turn the Rust card entered on', () => {
    const result = resolve3v3Battle([rust('r'), filler('c2'), filler('c3')], [card('d1', { atk: 30 }), filler('d2'), filler('d3')]);
    const rustTurns = result.log.filter(t => t.cCardId === 'r');
    assert.strictEqual(rustTurns[0].cHpEnd, 100);
    assert.ok(rustTurns[1].cHpEnd < 100);
  });
});

describe('Python Synergy', () => {
  test('a team of 3 Python cards heals at the synergy rate when it beats their own', () => {
    const py = (id: string) => card(id, { type: 'Python', primaryLanguage: 'Python', hp: 1000, maxHp: 1000 });
    const result = resolve3v3Battle([py('p1'), py('p2'), py('p3')], [card('d1', { atk: 30 }), card('d2'), card('d3')]);
    // 12% (2 × 6% with 3 cards) of 50 ATK, above Python's own 10%
    assert.ok(result.log.some(t => t.events.some(e => e.message === '[Python] Regenerated 6 HP.')));
  });
});
