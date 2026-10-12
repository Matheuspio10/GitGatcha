/**
 * Shared Web Audio manager (client only).
 *
 * - One AudioContext for the whole app, created lazily.
 * - Browsers keep a context "suspended" until a user gesture, so a global
 *   pointerdown/keydown listener (registered once) creates/resumes it on the
 *   first interaction anywhere. A click on e.g. "Battle!" therefore unlocks
 *   audio before the battle replay starts playing sounds.
 * - Every sound routes through a master gain, so muting also silences
 *   long-running nodes (ambient drones).
 * - The mute preference is persisted in localStorage.
 */

import { useSyncExternalStore } from 'react';

const MUTE_STORAGE_KEY = 'gitgacha:audio-muted';
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null; // null = not read from storage yet
let unlockRegistered = false;
const muteListeners = new Set<() => void>();

function readStoredMute(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredMute(value: boolean) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Storage blocked (private mode etc.) — keep the in-memory value only
  }
}

export function isAudioMuted(): boolean {
  if (typeof window === 'undefined') return false;
  if (muted === null) muted = readStoredMute();
  return muted;
}

export function setAudioMuted(value: boolean) {
  muted = value;
  writeStoredMute(value);
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.02);
  }
  muteListeners.forEach(fn => fn());
}

export function toggleAudioMuted() {
  setAudioMuted(!isAudioMuted());
}

function createContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = isAudioMuted() ? 0 : 1;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/**
 * Returns the shared context (creating it if needed) and tries to resume it.
 * Outside a user gesture the context may stay suspended until the first
 * interaction; sounds scheduled meanwhile are simply not heard.
 */
export function getAudioContext(): AudioContext | null {
  const c = createContext();
  if (c && c.state === 'suspended') {
    c.resume().catch(() => {});
  }
  ensureAudioUnlock();
  return c;
}

/** Node every sound should connect to instead of `ctx.destination`. */
export function getAudioOutput(): { ctx: AudioContext; out: AudioNode } | null {
  const c = getAudioContext();
  if (!c || !master) return null;
  return { ctx: c, out: master };
}

function handleUnlockGesture() {
  const c = createContext();
  if (!c) return;
  if (c.state === 'running') {
    removeUnlockListeners();
    return;
  }
  c.resume()
    .then(() => {
      if (c.state === 'running') removeUnlockListeners();
    })
    .catch(() => {});
}

function removeUnlockListeners() {
  UNLOCK_EVENTS.forEach(evt => window.removeEventListener(evt, handleUnlockGesture, true));
  unlockRegistered = false;
}

/** Registers the one-time global gesture listener that unlocks audio. Idempotent. */
export function ensureAudioUnlock() {
  if (typeof window === 'undefined' || unlockRegistered) return;
  if (ctx && ctx.state === 'running') return;
  unlockRegistered = true;
  UNLOCK_EVENTS.forEach(evt =>
    window.addEventListener(evt, handleUnlockGesture, { capture: true, passive: true })
  );
}

function subscribeMute(fn: () => void) {
  muteListeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MUTE_STORAGE_KEY) {
      muted = e.newValue === '1';
      if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
      fn();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    muteListeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** React hook: current mute state + toggle, synced across components and tabs. */
export function useAudioMuted() {
  const isMuted = useSyncExternalStore(subscribeMute, isAudioMuted, () => false);
  return { isMuted, setMuted: setAudioMuted, toggleMuted: toggleAudioMuted };
}
