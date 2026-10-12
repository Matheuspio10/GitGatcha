'use client';

import { useCallback } from 'react';
import { getAudioOutput, isAudioMuted, useAudioMuted } from '@/lib/audioManager';

export type BattleSound = 'lunge' | 'hit' | 'crit' | 'victory' | 'defeat' | 'passive';

/**
 * Procedural battle sounds on top of the shared audio manager.
 * The AudioContext is unlocked by the first user gesture anywhere in the app
 * (e.g. the "Battle!" click), so sounds play as soon as the replay starts.
 * Mute state is global and persisted.
 */
export function useBattleAudio() {
  const { isMuted, toggleMuted } = useAudioMuted();

  // Stable callback: reads the mute flag at call time, so toggling mute never
  // re-triggers effects that depend on playSound (e.g. the victory jingle).
  const playSound = useCallback((type: BattleSound) => {
    if (isAudioMuted()) return;
    const audio = getAudioOutput();
    if (!audio) return;
    const { ctx, out } = audio;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(out);

    switch (type) {
      case 'lunge':
        // Quick "swoosh"
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
        break;

      case 'hit':
        // Deep thud
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);

        // Add a noise burst for impact
        const noiseBufferSize = ctx.sampleRate * 0.1;
        const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1000;
        const noiseGain = ctx.createGain();
        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(out);
        
        noiseGain.gain.setValueAtTime(0.3, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        noiseSource.start(t);
        break;

      case 'crit':
        // Sharp metallic hit + thud
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
        
        // Second oscillator for dissonance
        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(1200, t);
        osc2.frequency.exponentialRampToValueAtTime(300, t + 0.3);
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(out);

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        gain2.gain.setValueAtTime(0.3, t);
        gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.start(t);
        osc2.start(t);
        osc.stop(t + 0.3);
        osc2.stop(t + 0.3);
        break;

      case 'passive':
        // Ascending chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.2);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);
        break;

      case 'victory':
        // Major arpeggio
        osc.type = 'square';
        const victoryNotes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
        gain.gain.setValueAtTime(0.2, t);
        victoryNotes.forEach((freq, idx) => {
          osc.frequency.setValueAtTime(freq, t + idx * 0.15);
        });
        gain.gain.linearRampToValueAtTime(0, t + 0.8);
        osc.start(t);
        osc.stop(t + 0.8);
        break;

      case 'defeat':
        // Descending low drone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 1.0);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0, t + 1.2);
        osc.start(t);
        osc.stop(t + 1.2);
        break;
    }
  }, []);

  return {
    playSound,
    isMuted,
    toggleMuted,
  };
}
