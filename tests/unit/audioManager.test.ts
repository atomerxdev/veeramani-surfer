import { describe, expect, it } from 'vitest';
import { AudioManager } from '../../src/core/AudioManager';

describe('AudioManager', () => {
  it('initialises with requested volume and mute state', () => {
    const audio = new AudioManager({ masterVolume: 0.8, muted: false });
    expect(audio.muted).toBe(false);

    audio.setMuted(true);
    expect(audio.muted).toBe(true);

    audio.setMuted(false);
    expect(audio.muted).toBe(false);
  });

  it('safely handles play calls before unlock without throwing', () => {
    const audio = new AudioManager({ masterVolume: 0.5, muted: false });
    expect(() => {
      audio.play('jump');
      audio.play('coin');
      audio.play('crash');
      audio.startAmbience();
      audio.stopAmbience();
      audio.stopIntroTrack();
      audio.stopAfter20Track();
    }).not.toThrow();
  });

  it('safely clamps volume to [0, 1]', () => {
    const audio = new AudioManager({ masterVolume: 0.5 });
    expect(() => {
      audio.setVolume(-0.5);
      audio.setVolume(1.5);
      audio.setVolume(0.7);
    }).not.toThrow();
  });

  it('safely handles track playback without audio elements crashing', () => {
    const audio = new AudioManager({ masterVolume: 0.6 });
    expect(() => {
      audio.playIntroTrack('test.mp3');
      audio.playAfter20Track('test2.mp3');
      audio.stopIntroTrack();
      audio.stopAfter20Track();
    }).not.toThrow();
  });
});
