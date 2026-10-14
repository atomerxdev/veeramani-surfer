/**
 * LocalStorage persistence with defensive parsing.
 *
 * Stored data is user-editable and can be corrupt or from an older version, so
 * everything is sanitised field by field and a broken payload never throws into
 * the game loop.
 */

import type { GraphicsQuality } from '../app/GameConfig';

export interface StoredSettings {
  quality: GraphicsQuality;
  reducedMotion: boolean;
  sound: boolean;
  touchPad: boolean;
}

export interface StoredProfile {
  version: number;
  bestScore: number;
  bestDistance: number;
  totalTokens: number;
  runs: number;
  settings: StoredSettings;
}

/** Minimal storage surface so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'santhai-sprint.profile.v1';
export const PROFILE_VERSION = 1;
const MAX_SCORE = 1_000_000_000;

export function defaultProfile(): StoredProfile {
  return {
    version: PROFILE_VERSION,
    bestScore: 0,
    bestDistance: 0,
    totalTokens: 0,
    runs: 0,
    settings: {
      quality: 'medium',
      reducedMotion: false,
      sound: true,
      touchPad: false,
    },
  };
}

function asCount(value: unknown, fallback = 0, max = MAX_SCORE): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asQuality(value: unknown, fallback: GraphicsQuality): GraphicsQuality {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

/** Turn any unknown payload into a usable profile. Never throws. */
export function sanitizeProfile(raw: unknown): StoredProfile {
  const base = defaultProfile();
  if (typeof raw !== 'object' || raw === null) return base;
  const source = raw as Record<string, unknown>;
  const settings =
    typeof source['settings'] === 'object' && source['settings'] !== null
      ? (source['settings'] as Record<string, unknown>)
      : {};

  return {
    version: PROFILE_VERSION,
    bestScore: asCount(source['bestScore'], base.bestScore),
    bestDistance: asCount(source['bestDistance'], base.bestDistance),
    totalTokens: asCount(source['totalTokens'], base.totalTokens),
    runs: asCount(source['runs'], base.runs),
    settings: {
      quality: asQuality(settings['quality'], base.settings.quality),
      reducedMotion: asBoolean(settings['reducedMotion'], base.settings.reducedMotion),
      sound: asBoolean(settings['sound'], base.settings.sound),
      touchPad: asBoolean(settings['touchPad'], base.settings.touchPad),
    },
  };
}

/** Best-effort access to localStorage (may be blocked by the browser). */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__santhai_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export class StorageManager {
  private profile: StoredProfile;
  /** True when the browser refused to give us persistent storage. */
  readonly persistent: boolean;

  constructor(
    private readonly storage: StorageLike | null = safeLocalStorage(),
    private readonly key: string = STORAGE_KEY,
  ) {
    this.persistent = storage !== null;
    this.profile = this.read();
  }

  private read(): StoredProfile {
    if (!this.storage) return defaultProfile();
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return defaultProfile();
      return sanitizeProfile(JSON.parse(raw) as unknown);
    } catch {
      // Malformed JSON or a storage exception: start clean rather than crash.
      return defaultProfile();
    }
  }

  get(): StoredProfile {
    return this.profile;
  }

  getSettings(): StoredSettings {
    return this.profile.settings;
  }

  patchSettings(patch: Partial<StoredSettings>): StoredSettings {
    const next: StoredProfile = {
      ...this.profile,
      settings: { ...this.profile.settings, ...patch },
    };
    this.commit(next);
    return this.profile.settings;
  }

  /**
   * Record a finished run. Returns whether the score was a new personal best.
   */
  recordRun(result: { score: number; distance: number; tokens: number }): {
    newBest: boolean;
    profile: StoredProfile;
  } {
    const score = asCount(result.score);
    const distance = asCount(result.distance);
    const tokens = asCount(result.tokens);
    const newBest = score > this.profile.bestScore;
    const next: StoredProfile = {
      ...this.profile,
      bestScore: Math.max(this.profile.bestScore, score),
      bestDistance: Math.max(this.profile.bestDistance, distance),
      totalTokens: Math.min(this.profile.totalTokens + tokens, MAX_SCORE),
      runs: Math.min(this.profile.runs + 1, MAX_SCORE),
    };
    this.commit(next);
    return { newBest, profile: this.profile };
  }

  reset(): StoredProfile {
    if (this.storage) {
      try {
        this.storage.removeItem(this.key);
      } catch {
        /* ignore */
      }
    }
    this.profile = defaultProfile();
    return this.profile;
  }

  private commit(next: StoredProfile): void {
    this.profile = next;
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(next));
    } catch {
      // Quota or private mode: keep the in-memory copy and carry on.
    }
  }
}
