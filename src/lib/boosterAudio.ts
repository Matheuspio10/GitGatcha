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

/** Sound when a card turns face-up. Epic/Legendary reuse the Rare sample (no dedicated files yet). */
export function playCardReveal(rarity: string) {
  switch (rarity) {
    case 'Legendary':
      playSample(SAMPLES.rare, { volume: 1, rate: 0.85 });
      playSample(SAMPLES.chime, { volume: 0.7, delay: 0.12 });
      break;
    case 'Epic':
      playSample(SAMPLES.rare, { volume: 1, rate: 0.92 });
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
