'use client';

export type SoundName = typeof AudioManager.SOUNDS[number];

class AudioManager {
  private static instance: AudioManager;
  
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private activeNodes: Map<string, AudioBufferSourceNode> = new Map();
  
  private isMuted: boolean = false;
  private masterVolume: number = 70;
  private musicVolume: number = 100;
  private sfxVolume: number = 100;
  
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  
  private isInitialized: boolean = false;
  private exclusivePlaying: boolean = false;

  public static readonly SOUNDS = [
    // General
    'general/nav_whoosh',
    'general/button_click_primary',
    'general/button_click_secondary',
    'general/tab_switch',
    'general/modal_open',
    'general/modal_close',
    'general/hover_tick',
    'general/error_buzzer',
    'general/success_chime',
    // Battle
    'battle/battle_start',
    'battle/stat_win',
    'battle/stat_loss',
    'battle/battle_win',
    'battle/battle_loss',
    'battle/rating_gain',
    'battle/rating_loss',
    'battle/rank_promotion',
    // Booster
    'booster/pack_select',
    'booster/card_common',
    'booster/card_uncommon',
    'booster/card_rare',
    'booster/card_epic',
    'booster/card_legendary',
    // Hacking
    'hacking/node_click',
    'hacking/path_segment',
    'hacking/puzzle_complete',
    'hacking/access_granted',
    'hacking/firewall_alarm',
    // Collection
    'collection/deck_add',
    'collection/deck_remove',
    'collection/card_detail',
    'collection/card_dismantle',
    'collection/duplicate',
    // Store
    'store/purchase',
    'store/currency_gain',
    // Notifications
    'notifications/friend_request',
    'notifications/challenge',
    'notifications/system',
  ] as const;

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private loadSettings() {
    if (typeof window === 'undefined') return;
    
    // Default accessibility OS check
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let defaultMute = prefersReducedMotion;
    
    try {
      const stored = localStorage.getItem('audio_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.masterVolume = parsed.masterVolume ?? 70;
        this.musicVolume = parsed.musicVolume ?? 100;
        this.sfxVolume = parsed.sfxVolume ?? 100;
        this.isMuted = parsed.isMuted ?? defaultMute;
      } else {
        this.isMuted = defaultMute;
      }
    } catch {}
    
    this.applyVolumes();
  }

  public saveSettings() {
    if (typeof window === 'undefined') return;
    localStorage.setItem('audio_settings', JSON.stringify({
      masterVolume: this.masterVolume,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      isMuted: this.isMuted
    }));
    this.applyVolumes();
  }

  public async init() {
    if (this.isInitialized || typeof window === 'undefined') return;

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      this.applyVolumes();

      // Preload all assets silently
      const promises = AudioManager.SOUNDS.map(s => this.preloadSound(s));
      await Promise.allSettled(promises);

      this.isInitialized = true;
    } catch (e) {
      console.warn('Audio initialization failed', e);
    }
  }
  
  private async preloadSound(soundName: string) {
    if (this.buffers.has(soundName)) return;

    // Try webm first, fallback to mp3
    const canPlayWebm = new Audio().canPlayType('audio/webm');
    const ext = canPlayWebm.includes('probably') || canPlayWebm.includes('maybe') ? 'webm' : 'mp3';
    
    try {
      const res = await fetch(`/sounds/${soundName}.${ext}`);
      if (!res.ok) throw new Error("Not found");
      const arrayBuffer = await res.arrayBuffer();
      if (!this.ctx) return;
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(soundName, audioBuffer);
    } catch (e) {
      // If WebM failed and we tried webm, try mp3 as fallback
      if (ext === 'webm') {
        try {
          const res = await fetch(`/sounds/${soundName}.mp3`);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            if (this.ctx) {
              const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
              this.buffers.set(soundName, audioBuffer);
            }
          }
        } catch {} // Ignore
      }
    }
  }

  private applyVolumes() {
    if (!this.masterGain || !this.sfxGain) return;
    
    const mutedMultiplier = this.isMuted ? 0 : 1;
    this.masterGain.gain.value = (this.masterVolume / 100) * mutedMultiplier;
    this.sfxGain.gain.value = (this.sfxVolume / 100);
  }

  public play(soundName: string, overlay: boolean = false) {
    if (!this.ctx || !this.isInitialized || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Fanfare exclusivity check
    if (this.exclusivePlaying) return;
    if (soundName === 'battle/rank_promotion' || soundName === 'battle/battle_win' || soundName === 'hacking/access_granted') {
      this.exclusivePlaying = true;
      // Stop all sounds
      this.activeNodes.forEach(node => { try { node.stop(); } catch{} });
      this.activeNodes.clear();
      
      setTimeout(() => {
        this.exclusivePlaying = false;
      }, 3000); // Reset exclusivity flag
    } else {
      // Overlap rules - restart same category (we can categorize by prefix, or just specific name)
      // The prompt says "Sounds in the same category — for example two button clicks in rapid succession — should not stack on top of each other. Restart the sound."
      const category = soundName.split('/')[0];
      
      if (!overlay) {
          // Find any playing sound of the same exact name, stop it
          // OR stop any sound of the same category? Prompt: "two button clicks... restart the sound". Let's restart the EXACT sound.
          const playing = this.activeNodes.get(soundName);
          if (playing) {
              try { playing.stop(); } catch {}
          }
      }
    }

    const buffer = this.buffers.get(soundName);
    if (!buffer) return; // Not loaded yet

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain!);
    
    // Apply slight volume tweak for hovers
    if (soundName === 'general/hover_tick') {
        const hoverGain = this.ctx.createGain();
        hoverGain.gain.value = 0.1;
        source.disconnect();
        source.connect(hoverGain);
        hoverGain.connect(this.sfxGain!);
    }

    source.start();
    this.activeNodes.set(soundName, source);
    source.onended = () => {
      if (this.activeNodes.get(soundName) === source) {
        this.activeNodes.delete(soundName);
      }
    };
  }

  // Settings getters & setters
  public get Settings() {
    return {
      masterVolume: this.masterVolume,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      isMuted: this.isMuted,
    };
  }

  public setMasterVolume(v: number) { this.masterVolume = v; this.saveSettings(); }
  public setMusicVolume(v: number) { this.musicVolume = v; this.saveSettings(); }
  public setSfxVolume(v: number) { this.sfxVolume = v; this.saveSettings(); }
  public toggleMute() { this.isMuted = !this.isMuted; this.saveSettings(); }
}

export const GlobalAudio = AudioManager.getInstance();
