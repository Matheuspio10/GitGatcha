import { test } from 'node:test';
import assert from 'node:assert';
import { createTranslator } from 'next-intl';
import { MESSAGES } from '@/i18n/messages';
import { COMBAT_LANGUAGES } from './battleConfig';
import { mulberry32 } from './balanceSim';
import { resolve3v3Battle, getCardType, type BattleCard, type BattleLogEvent, type Rarity } from './battleResolver';

const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const LANGUAGES: (string | null)[] = [...COMBAT_LANGUAGES, null];

function randomTeam(rng: () => number, side: string): BattleCard[] {
  return [0, 1, 2].map(i => {
    const primaryLanguage = LANGUAGES[Math.floor(rng() * LANGUAGES.length)];
    const hp = 60 + Math.floor(rng() * 140);
    return {
      id: `${side}${i}`, name: `${side}${i}`,
      atk: 20 + Math.floor(rng() * 80), def: Math.floor(rng() * 60), hp, maxHp: hp, stamina: 100,
      rarity: RARITIES[Math.floor(rng() * RARITIES.length)],
      primaryLanguage, type: getCardType({ primaryLanguage }),
    };
  });
}

/** Logs of many seeded battles: varied languages, rarities and stats. */
function sampleLogs(): BattleLogEvent[] {
  const events: BattleLogEvent[] = [];
  for (let seed = 1; seed <= 600; seed++) {
    const rng = mulberry32(seed);
    // Mono-language teams now and then, so the type synergies show up
    const mono = seed % 5 === 0 ? COMBAT_LANGUAGES[seed % COMBAT_LANGUAGES.length] : null;
    const team = (side: string) => randomTeam(rng, side).map(c => mono ? { ...c, primaryLanguage: mono, type: getCardType({ primaryLanguage: mono }) } : c);
    for (const turn of resolve3v3Battle(team('c'), team('d'), { rng }).log) events.push(...turn.events);
  }
  // Stalled battles (weak hits, huge HP) reach the turn cap and the turn limit
  for (const [cHp, dHp] of [[5000, 4000], [4000, 5000], [5000, 5000]]) {
    const wall = (side: string, hp: number) => [0, 1, 2].map(i => ({
      id: `${side}${i}`, name: `${side}${i}`, atk: 5, def: 0, hp, maxHp: hp, stamina: 100,
      rarity: 'Common' as Rarity, primaryLanguage: null, type: 'Neutral' as const,
    }));
    for (const turn of resolve3v3Battle(wall('c', cHp), wall('d', dHp), { rng: mulberry32(cHp + dHp) }).log) events.push(...turn.events);
  }
  return events;
}

const translator = (locale: 'en' | 'pt-BR') =>
  createTranslator({ locale, messages: MESSAGES[locale], namespace: 'gameBattle.log' as never }) as unknown as
    (key: string, values?: Record<string, string | number>) => string;

test('battle log: every event has a key whose English matches the saved sentence', () => {
  const en = translator('en');
  const events = sampleLogs();
  assert.ok(events.length > 1000);
  for (const ev of events) {
    assert.ok(ev.key, `event without a key: ${ev.message}`);
    assert.strictEqual(en(ev.key, ev.values), ev.message);
  }
});

test('battle log: every key shows up in sample battles and formats in Portuguese', () => {
  const pt = translator('pt-BR');
  const events = sampleLogs();
  for (const ev of events) {
    const text = pt(ev.key!, ev.values);
    assert.ok(text && !text.includes('{') && !text.startsWith('gameBattle.'), `${ev.key}: ${text}`);
  }
  const seen = new Set(events.map(ev => ev.key));
  const all = Object.keys(MESSAGES.en.gameBattle.log);
  const missing = all.filter(k => !seen.has(k as never));
  assert.deepStrictEqual(missing, [], `keys never seen: ${missing.join(', ')}`);
});

test('battle log: Portuguese sample sentences', () => {
  const pt = translator('pt-BR');
  assert.strictEqual(pt('battleWon', { winner: 'CHALLENGER' }), 'O DESAFIANTE VENCE A BATALHA!');
  assert.strictEqual(pt('battleWon', { winner: 'DEFENDER' }), 'O DEFENSOR VENCE A BATALHA!');
});
