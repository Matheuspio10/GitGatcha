'use client';

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Last element focused outside any modal: the control that opened a dialog. Kept
 * from a global listener because an `autoFocus` inside the dialog moves focus
 * before the dialog's effect can read it.
 */
let lastFocusedOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  const remember = (el: Element | null) => {
    if (el instanceof HTMLElement && el !== document.body && !el.closest('[aria-modal="true"]')) lastFocusedOutside = el;
  };
  document.addEventListener('focusin', e => remember(e.target as Element), true);
  // The key or click that opens a dialog happens before its autoFocus: remember who had it
  document.addEventListener('keydown', () => remember(document.activeElement), true);
  document.addEventListener('pointerdown', e => remember((e.target as Element | null)?.closest?.(FOCUSABLE) ?? null), true);
}

/**
 * Keyboard behaviour of a modal dialog (WAI-ARIA dialog pattern): while `open`,
 * Escape calls `onClose` (when given), Tab and Shift+Tab stay inside the panel,
 * focus moves into it on open and back to whatever had it on close. Put the
 * returned ref on the panel, next to `role="dialog"` and `aria-modal="true"`.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose?: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    const active = document.activeElement as HTMLElement | null;
    const previous = active && panel?.contains(active) ? lastFocusedOutside : active;
    // Focus the first control, or the panel itself, right after it mounts
    const timer = setTimeout(() => {
      if (!panel || panel.contains(document.activeElement)) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else {
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        panel.focus();
      }
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      // Give focus back to the control that opened the dialog
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  return ref;
}

/**
 * Makes a non-button element (a pack, a card, a table row) act like a button:
 * focusable, announced as a button, and activated with Enter or Space.
 */
export function pressable(onPress: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onPress,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // a real control inside handles its own keys
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    },
  };
}
