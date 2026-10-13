import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ONBOARDING_STEPS, buildOnboardingView, parseOnboardingState, OnboardingProgress } from './onboarding';
import { getPackById } from './packDefinitions';
import { STARTER_PACK_ID } from './onboarding';

const fresh: OnboardingProgress = { boosterCards: 0, collectionSeen: false, activeTeamCards: 0, battles: 0 };

describe('onboarding', () => {
  test('the starter pack exists', () => {
    assert.ok(getPackById(STARTER_PACK_ID));
  });

  test('players from before the onboarding (null or junk) have no state', () => {
    assert.strictEqual(parseOnboardingState(null), null);
    assert.strictEqual(parseOnboardingState({}), null);
    assert.strictEqual(parseOnboardingState([]), null);
  });

  test('unknown claimed ids are dropped', () => {
    const state = parseOnboardingState({ startedAt: '2026-10-13T00:00:00Z', claimed: ['open-pack', 'hack'] });
    assert.deepStrictEqual(state?.claimed, ['open-pack']);
  });

  test('steps complete from game data; a team needs 3 cards', () => {
    const state = { startedAt: 'x', claimed: [] };
    const view = buildOnboardingView(state, { boosterCards: 5, collectionSeen: true, activeTeamCards: 2, battles: 0 });
    assert.deepStrictEqual(view.steps.map(s => s.done), [true, true, false, false]);
    assert.strictEqual(view.complete, false);
  });

  test('complete only when every step is claimed; a claimed step stays done', () => {
    const all = ONBOARDING_STEPS.map(s => s.id);
    const view = buildOnboardingView({ startedAt: 'x', claimed: all }, fresh);
    assert.ok(view.steps.every(s => s.done && s.claimed));
    assert.strictEqual(view.complete, true);
  });
});
