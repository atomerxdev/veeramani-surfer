import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  StorageManager,
  defaultProfile,
  sanitizeProfile,
} from '../../src/core/StorageManager';
import { MemoryStorage } from './helpers';

describe('sanitizeProfile', () => {
  it('returns defaults for junk payloads', () => {
    expect(sanitizeProfile(null)).toEqual(defaultProfile());
    expect(sanitizeProfile('not an object')).toEqual(defaultProfile());
    expect(sanitizeProfile(42)).toEqual(defaultProfile());
    expect(sanitizeProfile([])).toEqual(defaultProfile());
  });

  it('rejects negative, NaN, infinite and non-numeric scores', () => {
    const profile = sanitizeProfile({
      bestScore: -100,
      bestDistance: Number.NaN,
      totalTokens: Number.POSITIVE_INFINITY,
      runs: '12',
    });
    expect(profile.bestScore).toBe(0);
    expect(profile.bestDistance).toBe(0);
    expect(profile.totalTokens).toBe(0);
    expect(profile.runs).toBe(0);
  });

  it('floors fractional values and caps absurd ones', () => {
    const profile = sanitizeProfile({ bestScore: 1234.87, bestDistance: 1e30 });
    expect(profile.bestScore).toBe(1234);
    expect(profile.bestDistance).toBeLessThanOrEqual(1_000_000_000);
  });

  it('falls back per field when settings are partial or wrong', () => {
    const profile = sanitizeProfile({
      settings: { quality: 'ultra', reducedMotion: 'yes', sound: false },
    });
    expect(profile.settings.quality).toBe('medium');
    expect(profile.settings.reducedMotion).toBe(false);
    expect(profile.settings.sound).toBe(false);
    expect(profile.settings.touchPad).toBe(false);
  });
});

describe('StorageManager', () => {
  it('round-trips a profile through storage', () => {
    const storage = new MemoryStorage();
    const manager = new StorageManager(storage);
    manager.recordRun({ score: 900, distance: 120, tokens: 7 });

    const reloaded = new StorageManager(storage);
    expect(reloaded.get().bestScore).toBe(900);
    expect(reloaded.get().bestDistance).toBe(120);
    expect(reloaded.get().totalTokens).toBe(7);
    expect(reloaded.get().runs).toBe(1);
  });

  it('survives malformed JSON', () => {
    const storage = new MemoryStorage();
    storage.seed(STORAGE_KEY, '{not json at all');
    const manager = new StorageManager(storage);
    expect(manager.get()).toEqual(defaultProfile());
  });

  it('keeps the higher score when a weaker run finishes', () => {
    const storage = new MemoryStorage();
    const manager = new StorageManager(storage);
    const first = manager.recordRun({ score: 500, distance: 100, tokens: 2 });
    expect(first.newBest).toBe(true);
    const second = manager.recordRun({ score: 200, distance: 50, tokens: 1 });
    expect(second.newBest).toBe(false);
    expect(manager.get().bestScore).toBe(500);
    expect(manager.get().runs).toBe(2);
    expect(manager.get().totalTokens).toBe(3);
  });

  it('does not throw when writes fail (private mode / quota)', () => {
    const storage = new MemoryStorage();
    const manager = new StorageManager(storage);
    storage.failWrites = true;
    expect(() => manager.recordRun({ score: 10, distance: 5, tokens: 1 })).not.toThrow();
    // The in-memory copy still reflects the run for this session.
    expect(manager.get().bestScore).toBe(10);
  });

  it('works with no storage at all', () => {
    const manager = new StorageManager(null);
    expect(manager.persistent).toBe(false);
    expect(() => manager.recordRun({ score: 5, distance: 5, tokens: 0 })).not.toThrow();
    expect(manager.get().bestScore).toBe(5);
  });

  it('reset() clears saved data', () => {
    const storage = new MemoryStorage();
    const manager = new StorageManager(storage);
    manager.recordRun({ score: 42, distance: 42, tokens: 4 });
    manager.patchSettings({ sound: false });
    manager.reset();
    expect(new StorageManager(storage).get()).toEqual(defaultProfile());
  });
});
