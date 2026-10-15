import { test } from 'node:test';
import assert from 'node:assert';
import { resolve3v3Battle, type BattleCard } from './battleResolver';
import { isReplayLog, knockouts, swapSides, withMaxHp, type ReplayData } from './battleReplay';

const card = (id: string, atk: number, def: number, hp: number): BattleCard => ({
  id, name: id, atk, def, hp, maxHp: hp, stamina: 100, rarity: 'Rare', primaryLanguage: 'Go', type: 'Go',
});

function battle(): ReplayData {
  const challengerTeam = [card('c1', 60, 40, 600), card('c2', 55, 45, 650), card('c3', 70, 30, 550)];
  const defenderTeam = [card('d1', 50, 50, 620), card('d2', 65, 35, 580), card('d3', 45, 55, 700)];
  const result = resolve3v3Battle(challengerTeam, defenderTeam);
  return {
    log: result.log,
    challengerTeam,
    defenderTeam,
    winnerSide: result.winner,
    battleStats: [{ cardId: 'c1', name: 'c1', team: 'CHALLENGER', damageDealt: 1, damageReceived: 2, passivesTriggered: 0, critsLanded: 0, momentumAchieved: false }],
  };
}

test('a log the resolver writes is a playable replay', () => {
  assert.ok(isReplayLog(battle().log));
});

test('old 1v1 battles (no log) and malformed logs have no replay', () => {
  for (const log of [null, undefined, [], {}, 'x', [{ turnNumber: 1 }], [{ cCardId: 'a', dCardId: 'b', events: 'no' }]]) {
    assert.strictEqual(isReplayLog(log), false, JSON.stringify(log));
  }
});

test('swapping sides puts the defender at the bottom and flips the winner', () => {
  const original = battle();
  const swapped = swapSides(original);
  assert.deepStrictEqual(swapped.challengerTeam, original.defenderTeam);
  assert.deepStrictEqual(swapped.defenderTeam, original.challengerTeam);
  assert.notStrictEqual(swapped.winnerSide, original.winnerSide);
  assert.strictEqual(swapped.battleStats?.[0].team, 'DEFENDER');
  original.log.forEach((turn, i) => {
    const s = swapped.log[i];
    assert.deepStrictEqual(
      [s.cCardId, s.dCardId, s.cHpStart, s.dHpStart, s.cHpEnd, s.dHpEnd],
      [turn.dCardId, turn.cCardId, turn.dHpStart, turn.cHpStart, turn.dHpEnd, turn.cHpEnd],
    );
    assert.strictEqual(s.events, turn.events);
  });
});

test('swapping twice gives the battle back', () => {
  const original = battle();
  assert.deepStrictEqual(swapSides(swapSides(original)), original);
});

test('the score counts knocked-out cards, and the winner never has fewer', () => {
  const b = battle();
  const score = knockouts(b.log);
  const winner = b.winnerSide === 'CHALLENGER' ? score.challenger : score.defender;
  const loser = b.winnerSide === 'CHALLENGER' ? score.defender : score.challenger;
  assert.ok(winner >= loser, JSON.stringify(score));
  assert.ok(score.challenger <= 3 && score.defender <= 3);
  const swapped = knockouts(swapSides(b).log);
  assert.deepStrictEqual(swapped, { challenger: score.defender, defender: score.challenger });
});

test('cards saved without maxHp start at full HP', () => {
  const [c] = withMaxHp([{ id: 'a', name: 'a', atk: 1, def: 1, hp: 300, rarity: 'Common' }]);
  assert.strictEqual(c.maxHp, 300);
  assert.deepStrictEqual(withMaxHp(null), []);
});
