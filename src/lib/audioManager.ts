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
 * - The mute preference and the master volume are persisted in localStorage.
 */

import { useSyncExternalStore } from 'react';

const MUTE_STORAGE_KEY = 'gitgacha:audio-muted';
const VOLUME_STORAGE_KEY = 'gitgacha:audio-volume';
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null; // null = not read from storage yet
let volume: number | null = null; // 0..1, null = not read from storage yet
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

function readStoredVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
    return window.localStorage.getItem(VOLUME_STORAGE_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

/** Master volume, 0..1 (1 by default). */
export function getAudioVolume(): number {
  if (typeof window === 'undefined') return 1;
  if (volume === null) volume = readStoredVolume();
  return volume;
}

/** Gain the master node should have: 0 when muted, else the volume. */
function masterLevel(): number {
  return isAudioMuted() ? 0 : getAudioVolume();
}

function applyMasterLevel() {
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
  }
}

export function setAudioVolume(value: number) {
  volume = Math.min(1, Math.max(0, value));
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Storage blocked: keep the in-memory value only
  }
  applyMasterLevel();
  muteListeners.forEach(fn => fn());
}

export function isAudioMuted(): boolean {
  if (typeof window === 'undefined') return false;
  if (muted === null) muted = readStoredMute();
  return muted;
}

export function setAudioMuted(value: boolean) {
  muted = value;
  writeStoredMute(value);
  applyMasterLevel();
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
    master.gain.value = masterLevel();
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
    if (e.key === MUTE_STORAGE_KEY || e.key === VOLUME_STORAGE_KEY) {
      if (e.key === MUTE_STORAGE_KEY) muted = e.newValue === '1';
      else volume = readStoredVolume();
      applyMasterLevel();
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

/** React hook: master volume (0..1), synced across components and tabs. */
export function useAudioVolume() {
  const level = useSyncExternalStore(subscribeMute, getAudioVolume, () => 1);
  return { volume: level, setVolume: setAudioVolume };
}

// ─── Sample playback (files under /public/sounds) ─────────────────────────

const sampleCache = new Map<string, Promise<AudioBuffer | null>>();
let preferredExt: 'webm' | 'mp3' | null = null;

/** Opus-in-WebM where supported (smaller), MP3 elsewhere (older Safari). */
function sampleExtension(): 'webm' | 'mp3' {
  if (preferredExt) return preferredExt;
  try {
    const probe = document.createElement('audio');
    preferredExt = probe.canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp3';
  } catch {
    preferredExt = 'mp3';
  }
  return preferredExt;
}

function loadSample(name: string): Promise<AudioBuffer | null> {
  const cached = sampleCache.get(name);
  if (cached) return cached;
  const c = createContext();
  if (!c) return Promise.resolve(null);
  const ext = sampleExtension();
  const decode = (url: string) =>
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buf => c.decodeAudioData(buf));
  const promise = decode(`/sounds/${name}.${ext}`)
    .catch(() => (ext === 'webm' ? decode(`/sounds/${name}.mp3`) : Promise.reject()))
    .catch(() => {
      sampleCache.delete(name); // allow a retry later
      return null;
    });
  sampleCache.set(name, promise);
  return promise;
}

/** Fetches and decodes samples ahead of time, e.g. `preloadSamples(['booster/card_rare'])`. */
export function preloadSamples(names: string[]) {
  if (typeof window === 'undefined') return;
  names.forEach(n => void loadSample(n));
}

export interface SampleOptions {
  /** 0..1+ gain for this one-shot (default 1) */
  volume?: number;
  /** Playback speed / pitch (default 1) */
  rate?: number;
  /** Seconds from now (default 0) */
  delay?: number;
}

/**
 * Plays a sample from `/public/sounds/<name>.(webm|mp3)` through the master
 * gain (so the global mute applies). Silently does nothing when muted or when
 * audio is unavailable. `name` is relative, e.g. `booster/card_common`.
 */
export function playSample(name: string, { volume = 1, rate = 1, delay = 0 }: SampleOptions = {}) {
  if (typeof window === 'undefined' || isAudioMuted()) return;
  const audio = getAudioOutput();
  if (!audio) return;
  const requestedAt = audio.ctx.currentTime;
  void loadSample(name).then(buffer => {
    if (!buffer || isAudioMuted()) return;
    const { ctx: c, out } = audio;
    // Too late (first load took long): drop it rather than play out of sync
    if (c.currentTime - requestedAt > 0.6) return;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = c.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(out);
    src.start(c.currentTime + delay);
  });
}
