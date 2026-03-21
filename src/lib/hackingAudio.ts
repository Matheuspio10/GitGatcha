/**
 * Hacking Mini-Game Audio — All sounds generated procedurally via Web Audio API.
 * No external audio files needed. Lightweight and performant.
 */

let audioCtx: AudioContext | null = null;
let ambientOsc: OscillatorNode | null = null;
let ambientGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Short digital click when a valid node is selected */
export function playNodeClick() {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.06);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.06);
}

/** Subtle data blip when a pathway segment lights up */
export function playPathSegment() {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

/** "Node Secured" chime — ascending two-tone chord */
export function playPuzzleComplete() {
  const ctx = getCtx();
  if (!ctx) return;

  // Two oscillators for a chord
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.08);
    osc.stop(ctx.currentTime + 0.5);
  });
}

/** Dramatic "ACCESS GRANTED" sound — deep sweep + chord */
export function playAccessGranted() {
  const ctx = getCtx();
  if (!ctx) return;

  // Low sweep
  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(80, ctx.currentTime);
  sweep.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
  sweep.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.8);
  sweepGain.gain.setValueAtTime(0.15, ctx.currentTime);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  sweep.connect(sweepGain);
  sweepGain.connect(ctx.destination);
  sweep.start();
  sweep.stop(ctx.currentTime + 1.0);

  // Impact chord
  [220, 330, 440, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2 + i * 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 1.2 + i * 0.1);
  });
}

/** Start the ambient server-room drone (loops until stopped) */
export function startAmbientDrone() {
  const ctx = getCtx();
  if (!ctx || ambientOsc) return;

  ambientOsc = ctx.createOscillator();
  ambientGain = ctx.createGain();

  ambientOsc.type = 'sine';
  ambientOsc.frequency.setValueAtTime(55, ctx.currentTime);

  // Subtle LFO for rumble
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.5, ctx.currentTime);
  lfoGain.gain.setValueAtTime(8, ctx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(ambientOsc.frequency);
  lfo.start();

  ambientGain.gain.setValueAtTime(0, ctx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.0);

  ambientOsc.connect(ambientGain);
  ambientGain.connect(ctx.destination);
  ambientOsc.start();
}

/** Fade out and stop the ambient drone */
export function stopAmbientDrone() {
  const ctx = getCtx();
  if (!ctx || !ambientOsc || !ambientGain) return;

  try {
    ambientGain.gain.cancelScheduledValues(ctx.currentTime);
    ambientGain.gain.setValueAtTime(ambientGain.gain.value, ctx.currentTime);
    ambientGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
    ambientOsc.stop(ctx.currentTime + 1.1);
  } catch {
    // Already stopped
  }
  ambientOsc = null;
  ambientGain = null;
}
