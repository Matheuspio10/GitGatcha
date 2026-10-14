/**
 * Booster-opening sounds (client only): the sample files in
 * /public/sounds/booster plus a few procedural layers (paper rip, suspense
 * riser). Everything goes through the shared audio manager, so the global
 * mute applies.
 */

import { getAudioOutput, isAudioMuted, playSample, preloadSamples } from './audioManager';

const SAMPLES = {
  pack: 'booster/pack_select',
  common: 'booster/card_common',
  uncommon: 'booster/card_uncommon',
  rare: 'booster/card_rare',
  whoosh: 'general/nav_whoosh',
  chime: 'general/success_chime',
} as const;

export function preloadBoosterSounds() {
  preloadSamples(Object.values(SAMPLES));
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const size = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Foil wrapper ripping open: the pack sample plus a filtered noise sweep. */
export function playPackTear() {
  playSample(SAMPLES.pack, { volume: 0.8 });
  if (isAudioMuted()) return;
  const audio = getAudioOutput();
  if (!audio) return;
  const { ctx, out } = audio;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.45);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(5200, t + 0.35);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t);
  src.stop(t + 0.45);
}

/** Rising tone under the Epic/Legendary suspense glow. */
export function playSuspenseRiser(seconds: number, legendary: boolean) {
  if (isAudioMuted() || seconds <= 0) return;
  const audio = getAudioOutput();
  if (!audio) return;
  const { ctx, out } = audio;
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(legendary ? 0.12 : 0.08, t + seconds * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.05);
  gain.connect(out);
  const base = legendary ? 180 : 220;
  [1, 1.5, legendary ? 2 : 0].filter(Boolean).forEach(mult => {
    const osc = ctx.createOscillator();
    osc.type = mult === 1 ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(base * mult, t);
    osc.frequency.exponentialRampToValueAtTime(base * mult * (legendary ? 4 : 3), t + seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    osc.connect(filter);
    filter.connect(gain);
    osc.start(t);
    osc.stop(t + seconds + 0.1);
  });
}

interface Tone {
  freq: number;
  /** Seconds after now. */
  at: number;
  /** Seconds until it fades out. */
  dur: number;
  gain: number;
  type?: OscillatorType;
}

/** Plays a few short synthesized notes through the master gain. */
function playTones(tones: Tone[]) {
  if (isAudioMuted()) return;
  const audio = getAudioOutput();
  if (!audio) return;
  const { ctx, out } = audio;
  const t0 = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    osc.type = tone.type ?? 'triangle';
    osc.frequency.value = tone.freq;
    const gain = ctx.createGain();
    const start = t0 + tone.at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + tone.dur + 0.05);
  }
}

/** Epic: a quick rising arpeggio (E, G#, B, E) over the Rare hit. */
function playEpicFlourish() {
  [659.25, 830.61, 987.77, 1318.51].forEach((freq, i) => playTones([
    { freq, at: 0.06 + i * 0.07, dur: 0.45, gain: 0.07 },
    { freq: freq * 2, at: 0.06 + i * 0.07, dur: 0.25, gain: 0.02, type: 'sine' },
  ]));
}

/** Legendary: a slower arpeggio into a held major chord with a high shimmer. */
function playLegendaryFanfare() {
  const arpeggio = [523.25, 659.25, 783.99, 1046.5];
  playTones(arpeggio.map((freq, i) => ({ freq, at: 0.05 + i * 0.09, dur: 0.5, gain: 0.07 })));
  // The held chord (C major, C6 on top), slightly detuned pairs for width
  playTones([523.25, 659.25, 783.99, 1046.5].flatMap(freq => [
    { freq, at: 0.42, dur: 1.6, gain: 0.045, type: 'sawtooth' as const },
    { freq: freq * 1.004, at: 0.42, dur: 1.6, gain: 0.035, type: 'triangle' as const },
  ]));
  // Shimmer: high sparkles on top of the chord
  playTones([2093, 2637, 3136, 2637, 4186].map((freq, i) => ({ freq, at: 0.5 + i * 0.11, dur: 0.3, gain: 0.018, type: 'sine' as const })));
}

/** Sound when a card turns face-up; Epic and Legendary add their own synthesized flourish. */
export function playCardReveal(rarity: string) {
  switch (rarity) {
    case 'Legendary':
      playSample(SAMPLES.rare, { volume: 1, rate: 0.85 });
      playSample(SAMPLES.chime, { volume: 0.6, delay: 0.12 });
      playLegendaryFanfare();
      break;
    case 'Epic':
      playSample(SAMPLES.rare, { volume: 1, rate: 0.92 });
      playEpicFlourish();
      break;
    case 'Rare':
      playSample(SAMPLES.rare, { volume: 0.9 });
      break;
    case 'Uncommon':
      playSample(SAMPLES.uncommon, { volume: 0.8 });
      break;
    default:
      playSample(SAMPLES.common, { volume: 0.7 });
  }
}

/** A revealed card thrown off the stack. */
export function playCardFling() {
  playSample(SAMPLES.whoosh, { volume: 0.45, rate: 1.15 });
}
