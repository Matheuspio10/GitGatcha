import { test } from 'node:test';
import assert from 'node:assert';
import type { KeyboardEvent } from 'react';
import { pressable } from './useDialog';

const keyEvent = (key: string, ownTarget = true) => {
  const el = {};
  let prevented = false;
  const event = { key, target: el, currentTarget: ownTarget ? el : {}, preventDefault: () => { prevented = true; } };
  return { event: event as unknown as KeyboardEvent, prevented: () => prevented };
};

test('a pressable element is a focusable button with a label', () => {
  const props = pressable(() => {}, 'Open pack');
  assert.strictEqual(props.role, 'button');
  assert.strictEqual(props.tabIndex, 0);
  assert.strictEqual(props['aria-label'], 'Open pack');
});

test('Enter and Space activate it, other keys do not', () => {
  let presses = 0;
  const props = pressable(() => { presses++; });
  for (const key of ['Enter', ' ']) {
    const { event, prevented } = keyEvent(key);
    props.onKeyDown(event);
    assert.ok(prevented(), `${key} should not scroll or submit`);
  }
  props.onKeyDown(keyEvent('a').event);
  props.onKeyDown(keyEvent('Tab').event);
  assert.strictEqual(presses, 2);
});

test('keys typed in a control inside it are left alone', () => {
  let presses = 0;
  const props = pressable(() => { presses++; });
  props.onKeyDown(keyEvent('Enter', false).event);
  assert.strictEqual(presses, 0);
});
