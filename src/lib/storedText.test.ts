import { test } from 'node:test';
import assert from 'node:assert';
import { createTranslator } from 'next-intl';
import { MESSAGES } from '@/i18n/messages';
import type { GameNamespace, GameText, LooseTranslator } from '@/i18n/gameText';
import { makeStoredText } from '@/i18n/storedTextFormat';
import { gameName, ownText, playerName, storedText, winLoss } from './storedText';
import { englishText } from './storedTextEnglish';

/** The formatter the screens build, for one locale. */
function formatterFor(locale: 'en' | 'pt-BR') {
  const translator = (namespace: string) =>
    createTranslator({ locale, messages: MESSAGES[locale], namespace: namespace as never }) as unknown as LooseTranslator;
  const game = (namespace: GameNamespace): GameText => {
    const t = translator(namespace);
    return (key, fallback, values) => (t.has(key) ? t(key, values) : fallback);
  };
  return makeStoredText(translator('notifications.storedText'), {
    game: game('game'), gamePacks: game('gamePacks'), gameAchievements: game('gameAchievements'), gameBattle: game('gameBattle'),
  });
}

test('stored text: the English copy reads like the old sentences', () => {
  assert.strictEqual(
    englishText(storedText('cardGift', { from: 'ana', card: 'Linus', rarity: 'Legendary', shiny: 'yes' })),
    "ana gave you a Shiny Linus (Legendary)! It's in your collection.",
  );
  assert.strictEqual(
    englishText(storedText('cardGift', { from: playerName(null), card: 'Linus', rarity: 'Rare', shiny: 'no' })),
    "Someone gave you Linus (Rare)! It's in your collection.",
  );
  assert.strictEqual(
    englishText(storedText('tradeOffer', { from: 'ana', cards: ['Linus', 'Guido'], count: 1 })),
    'ana proposed a trade: Linus, Guido for 1 of your cards.',
  );
  assert.strictEqual(
    englishText(storedText('battleDetail', { league: gameName.league('OPEN', 'Open League'), result: winLoss(true) })),
    'Open League win',
  );
  assert.strictEqual(
    englishText(storedText('rankPromotionDetail', { tier: gameName.rank({ id: 'gold', name: 'Gold' }), season: 3 })),
    'Gold · Season 3',
  );
  assert.strictEqual(englishText(storedText('name', { name: gameName.pack('event-web', 'Web Week Pack') })), 'Web Week Pack');
  assert.strictEqual(
    englishText(storedText('name', { name: gameName.mission('daily', { description: 'Win 2 Battles', type: 'WIN_BATTLE', targetValue: '2' }) })),
    'Win 2 Battles',
  );
});

test('stored text: shown in Portuguese, game names included', () => {
  const pt = formatterFor('pt-BR');
  const en = formatterFor('en');
  assert.strictEqual(pt(storedText('tradeDeclined', { who: 'ana' })), 'ana recusou a sua troca.');
  assert.strictEqual(pt(storedText('friendChallengeDetail', { result: winLoss(false) })), 'Desafio de amigo: derrota');

  const achievements = storedText('name', {
    name: [
      ownText('achievementTier', 'Collector Gold', { name: gameName.achievement('collector', 'Collector'), tier: gameName.achievementTier(3, 'Gold') }),
      ownText('achievementTier', 'Duelist Bronze', { name: gameName.achievement('duelist', 'Duelist'), tier: gameName.achievementTier(1, 'Bronze') }),
    ],
  });
  assert.strictEqual(en(achievements), 'Collector Gold, Duelist Bronze');
  assert.notStrictEqual(pt(achievements), en(achievements));

  // A game name: whatever Portuguese has for it, not the English fallback
  const tower = storedText('towerDetail', { tower: gameName.tower('Rust'), floor: 4 });
  assert.match(pt(tower), /Rust.* · andar 4$/);
  assert.strictEqual(en(tower), 'The Rust Gauntlet · floor 4');
});

test('stored text: older rows keep their English sentence', () => {
  const pt = formatterFor('pt-BR');
  assert.strictEqual(pt(undefined, 'Old sentence'), 'Old sentence');
  assert.strictEqual(pt(null, null), '');
  assert.strictEqual(pt({ key: 'gone' as never }, 'Old sentence'), 'Old sentence');
});
