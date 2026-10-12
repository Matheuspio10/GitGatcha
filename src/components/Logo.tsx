'use client';

import React, { useId } from 'react';
import clsx from 'clsx';

/**
 * GitGacha mark: a gacha capsule cut by a git timeline; the capsule button is a commit.
 * `mono` draws it in currentColor (watermarks, card backs, single-colour surfaces).
 */
export function LogoMark({ size = 32, mono = false, className, title }: { size?: number | string; mono?: boolean; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const top = `gg-top-${uid}`;
  const bot = `gg-bot-${uid}`;
  const ink = mono ? 'currentColor' : '#ecebf5';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={clsx('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {!mono && (
        <defs>
          <linearGradient id={top} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c4dff" />
            <stop offset="1" stopColor="#ff4fa3" />
          </linearGradient>
          <linearGradient id={bot} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2840" />
            <stop offset="1" stopColor="#14131f" />
          </linearGradient>
        </defs>
      )}
      <line x1="2" y1="32" x2="62" y2="32" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="4.5" cy="32" r="3.5" fill={mono ? 'currentColor' : '#3ddc97'} />
      <circle cx="59.5" cy="32" r="3.5" fill={mono ? 'currentColor' : '#3ddc97'} />
      <path d="M11 32a21 21 0 0 1 42 0z" fill={mono ? 'currentColor' : `url(#${top})`} />
      {!mono && <path d="M11 32a21 21 0 0 0 42 0z" fill={`url(#${bot})`} />}
      <circle cx="32" cy="32" r="21" fill="none" stroke={ink} strokeWidth="3.5" />
      {!mono && <path d="M19 22a15 15 0 0 1 9-6" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />}
      <line x1="11" y1="32" x2="53" y2="32" stroke={ink} strokeWidth="3.5" />
      <circle cx="32" cy="32" r="7.5" fill={mono ? 'var(--logo-hole, #06060b)' : '#06060b'} stroke={ink} strokeWidth="3.5" />
      {!mono && <circle cx="32" cy="32" r="2.6" fill="#3ddc97" />}
    </svg>
  );
}

/** Mark + "GitGacha" wordmark. `size` is the font size in px (omit it to size with a text-* class); the mark scales with it. */
export function Logo({ size, className, showMark = true }: { size?: number; className?: string; showMark?: boolean }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-[0.45em] font-display font-extrabold leading-none tracking-[-0.03em]', className)}
      style={size ? { fontSize: size } : undefined}
    >
      {showMark && <LogoMark size="1.45em" />}
      <span>
        <span className="text-[#ecebf5]">Git</span>
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-a to-brand-b">Gacha</span>
      </span>
    </span>
  );
}
