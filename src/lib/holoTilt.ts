/**
 * Device-tilt input for the holographic card sheen (client only).
 *
 * One shared `deviceorientation` listener (ref-counted across every mounted
 * holo card) writes `--gyro-x` / `--gyro-y` (0%..100%) on <html>. Cards read
 * them as the fallback when no mouse pointer is over them, so a grid of 100
 * cards costs one listener and zero React re-renders.
 * Skipped entirely with prefers-reduced-motion or on non-touch devices.
 * iOS 13+ only sends the events after `DeviceOrientationEvent.requestPermission()`,
 * which must run inside a user gesture: it is asked on the first tap.
 */

import { useEffect } from 'react';

let subscribers = 0;
let frame = 0;
let pending: { x: number; y: number } | null = null;
let permissionAsked = false;

type OrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** iOS: asks for motion access on the first tap (once per page load; the system remembers the answer). */
function askPermissionOnFirstTap() {
  const requestPermission = (DeviceOrientationEvent as OrientationEventWithPermission).requestPermission;
  if (permissionAsked || typeof requestPermission !== 'function') return;
  permissionAsked = true;
  window.addEventListener('touchend', () => {
    requestPermission.call(DeviceOrientationEvent).catch(() => { /* denied or not in a gesture: no tilt */ });
  }, { once: true });
}

function flush() {
  frame = 0;
  if (!pending) return;
  const root = document.documentElement.style;
  root.setProperty('--gyro-x', `${pending.x.toFixed(1)}%`);
  root.setProperty('--gyro-y', `${pending.y.toFixed(1)}%`);
  pending = null;
}

function onOrientation(e: DeviceOrientationEvent) {
  if (e.gamma === null || e.beta === null) return;
  // gamma: left/right tilt (-90..90); beta: front/back (-180..180), ~45° when held
  const x = Math.min(Math.max(((e.gamma + 45) / 90) * 100, 0), 100);
  const y = Math.min(Math.max(((e.beta - 10) / 70) * 100, 0), 100);
  pending = { x, y };
  if (!frame) frame = requestAnimationFrame(flush);
}

function canUseGyro() {
  return (
    typeof window !== 'undefined' &&
    'DeviceOrientationEvent' in window &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Subscribes the shared tilt listener while `enabled` is true. */
export function useHoloGyro(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !canUseGyro()) return;
    subscribers += 1;
    if (subscribers === 1) {
      window.addEventListener('deviceorientation', onOrientation);
      askPermissionOnFirstTap();
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        window.removeEventListener('deviceorientation', onOrientation);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        pending = null;
      }
    };
  }, [enabled]);
}
