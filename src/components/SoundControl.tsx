'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SpeakerHigh, SpeakerLow, SpeakerSlash } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { playSample, useAudioMuted, useAudioVolume } from '@/lib/audioManager';

/** Header button with the game's sound settings: volume slider and mute. */
export function SoundControl() {
  const { isMuted, toggleMuted } = useAudioMuted();
  const { volume, setVolume } = useAudioVolume();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const sliderId = useId();
  const t = useTranslations('nav.sound');

  // Close on Escape or a click outside (a popover, not a modal: the page stays usable)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: PointerEvent) => { if (!wrapper.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const silent = isMuted || volume === 0;
  const Icon = silent ? SpeakerSlash : volume < 0.5 ? SpeakerLow : SpeakerHigh;
  const percent = Math.round(volume * 100);

  return (
    <div ref={wrapper} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={silent ? t('off') : t('level', { percent })}
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-400 transition-colors hover:text-white"
      >
        <Icon size={22} weight={silent ? 'regular' : 'fill'} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[60] mt-2 w-60 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <label htmlFor={sliderId} className="text-sm font-bold text-white">{t('volume')}</label>
            <span className="font-mono text-xs text-slate-400">{isMuted ? t('muted') : `${percent}%`}</span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            disabled={isMuted}
            onChange={e => setVolume(Number(e.target.value) / 100)}
            // A short click on release, so the new level can be heard
            onPointerUp={() => playSample('general/button_click_primary', { volume: 0.8 })}
            onKeyUp={() => playSample('general/button_click_primary', { volume: 0.8 })}
            className="mt-3 w-full accent-brand-b disabled:opacity-40"
          />
          <button
            onClick={toggleMuted}
            aria-pressed={isMuted}
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-700"
          >
            {isMuted ? t('turnOn') : t('muteAll')}
          </button>
        </div>
      )}
    </div>
  );
}
