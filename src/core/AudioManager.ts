/**
 * Audio manager.
 *
 * Every sound in the game is synthesised at runtime with the Web Audio API, so
 * the project ships no third-party audio files and cannot accidentally include
 * copyrighted music or effects. Swap in recorded assets later by routing them
 * through the same `play()` / `setMuted()` surface.
 *
 * The AudioContext is only created after a user gesture, which respects browser
 * autoplay policies.
 */

export type SoundName =
  | 'jump'
  | 'land'
  | 'slide'
  | 'stumble'
  | 'crash'
  | 'coin'
  | 'powerup'
  | 'shieldBlock'
  | 'click'
  | 'gameOver'
  | 'start'
  | 'footstep';

export interface AudioOptions {
  readonly masterVolume: number;
  /** Start muted (mirrors the stored sound setting). */
  readonly muted?: boolean;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume: number;
  private mutedState: boolean;
  /** Throttle footsteps so a fast run cycle does not become a buzz. */
  private lastFootstep = 0;
  private readonly supported: boolean;
  private introAudio: HTMLAudioElement | null = null;
  private after20Audio: HTMLAudioElement | null = null;

  constructor(options: AudioOptions) {
    this.volume = options.masterVolume;
    this.mutedState = options.muted ?? false;
    this.supported = getAudioContextCtor() !== null;
  }

  get available(): boolean {
    return this.supported;
  }

  get muted(): boolean {
    return this.mutedState;
  }

  /**
   * Play recorded intro audio track (vlog voiceover).
   */
  playIntroTrack(src: string): void {
    if (typeof Audio === 'undefined') return;
    try {
      this.stopIntroTrack();
      const audio = new Audio(src);
      audio.volume = this.mutedState ? 0 : this.volume;
      this.introAudio = audio;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          /* ignore autoplay restrictions */
        });
      }
    } catch {
      /* ignore */
    }
  }

  stopIntroTrack(): void {
    if (this.introAudio) {
      try {
        this.introAudio.pause();
        this.introAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
      this.introAudio = null;
    }
  }

  /**
   * Play recorded 20-second milestone track ('after 20.mp3').
   */
  playAfter20Track(src: string, onEnded?: () => void): void {
    if (typeof Audio === 'undefined') return;
    try {
      this.stopAfter20Track();
      const audio = new Audio(src);
      audio.volume = this.mutedState ? 0 : this.volume;
      this.after20Audio = audio;
      if (onEnded) {
        audio.addEventListener('ended', onEnded, { once: true });
      }
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          /* ignore autoplay restrictions */
        });
      }
    } catch {
      /* ignore */
    }
  }

  stopAfter20Track(): void {
    if (this.after20Audio) {
      try {
        this.after20Audio.pause();
        this.after20Audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      this.after20Audio = null;
    }
  }

  get isAfter20Playing(): boolean {
    return this.after20Audio !== null && !this.after20Audio.paused && !this.after20Audio.ended;
  }

  /**
   * Create/resume the AudioContext. Must be called from a user gesture handler.
   */
  async unlock(): Promise<void> {
    if (!this.supported) return;
    if (!this.ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mutedState ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore: the next gesture will retry */
      }
    }
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    if (this.introAudio) {
      this.introAudio.volume = muted ? 0 : this.volume;
    }
    if (this.after20Audio) {
      this.after20Audio.volume = muted ? 0 : this.volume;
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.min(Math.max(volume, 0), 1);
    if (this.master && this.ctx && !this.mutedState) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
    if (this.introAudio && !this.mutedState) {
      this.introAudio.volume = this.volume;
    }
    if (this.after20Audio && !this.mutedState) {
      this.after20Audio.volume = this.volume;
    }
  }

  /** Ambient market bed: filtered noise with a slow swell. Safe to call twice. */
  startAmbience(): void {
    if (!this.supported || !this.ctx || !this.master || this.ambienceSource) return;
    const ctx = this.ctx;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;

    const gain = ctx.createGain();
    gain.gain.value = 0.16;

    // Slow LFO gives the crowd a breathing quality.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();

    source.connect(filter).connect(gain).connect(this.master);
    source.start();

    this.ambienceSource = source;
    this.ambienceGain = gain;
  }

  stopAmbience(): void {
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
      } catch {
        /* ignore */
      }
      this.ambienceSource.disconnect();
      this.ambienceSource = null;
    }
    this.ambienceGain?.disconnect();
    this.ambienceGain = null;
  }

  /** Fade the ambience down while paused / in menus. */
  setAmbienceLevel(level: number): void {
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.setTargetAtTime(Math.max(0, level) * 0.18, this.ctx.currentTime, 0.2);
    }
  }

  play(name: SoundName, intensity = 1): void {
    if (!this.supported || !this.ctx || !this.master || this.mutedState) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const boost = Math.min(Math.max(intensity, 0.2), 2);

    switch (name) {
      case 'jump':
        this.blip(t, 380, 720, 0.16, 'sine', 0.3 * boost);
        break;
      case 'land':
        this.blip(t, 200, 120, 0.1, 'sine', 0.22 * boost);
        break;
      case 'slide':
        this.sweepNoise(t, 0.32, 1200, 300, 0.3 * boost);
        break;
      case 'stumble':
        this.blip(t, 260, 90, 0.28, 'sawtooth', 0.18 * boost);
        this.sweepNoise(t, 0.22, 900, 200, 0.2 * boost);
        break;
      case 'crash':
        this.blip(t, 150, 45, 0.4, 'square', 0.24 * boost);
        this.sweepNoise(t, 0.4, 1600, 150, 0.34 * boost);
        break;
      case 'coin':
        this.blip(t, 880, 1320, 0.12, 'triangle', 0.2 * boost);
        this.blip(t + 0.06, 1320, 1760, 0.1, 'triangle', 0.14 * boost);
        break;
      case 'powerup':
        this.arpeggio(t, [523.25, 659.25, 783.99, 1046.5], 0.09, 'triangle', 0.2);
        break;
      case 'shieldBlock':
        this.sweepNoise(t, 0.24, 300, 2400, 0.26);
        this.blip(t, 520, 900, 0.2, 'sine', 0.18);
        break;
      case 'click':
        this.blip(t, 640, 520, 0.07, 'square', 0.14);
        break;
      case 'gameOver':
        this.arpeggio(t, [523.25, 415.3, 329.63, 246.94], 0.16, 'sawtooth', 0.16);
        break;
      case 'start':
        this.arpeggio(t, [392, 523.25, 659.25], 0.11, 'triangle', 0.18);
        break;
      case 'footstep':
        if (t - this.lastFootstep < 0.14) return;
        this.lastFootstep = t;
        this.sweepNoise(t, 0.07, 700, 200, 0.1 * boost);
        break;
      default:
        break;
    }
  }

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(this.ctx.sampleRate * 2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      // Brown-ish noise: warmer and less harsh than white.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private blip(
    startTime: number,
    fromHz: number,
    toHz: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  private sweepNoise(
    startTime: number,
    duration: number,
    fromHz: number,
    toHz: number,
    gainValue: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(fromHz, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, toHz), startTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(startTime);
    source.stop(startTime + duration + 0.03);
  }

  private arpeggio(
    startTime: number,
    notes: readonly number[],
    step: number,
    type: OscillatorType,
    gainValue: number,
  ): void {
    notes.forEach((note, index) => {
      this.blip(startTime + index * step, note, note * 1.5, step * 1.6, type, gainValue);
    });
  }

  dispose(): void {
    this.stopIntroTrack();
    this.stopAfter20Track();
    this.stopAmbience();
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }
}
