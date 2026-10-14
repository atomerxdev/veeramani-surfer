import type { StorageLike } from '../../src/core/StorageManager';
import { GameConfig, type QualityProfile } from '../../src/app/GameConfig';

/** Minimal in-memory StorageLike used to test persistence without a browser. */
export class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  /** When set, every write throws - emulates private mode / quota errors. */
  failWrites = false;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  /** Seed raw content, e.g. malformed JSON. */
  seed(key: string, value: string): void {
    this.data.set(key, value);
  }

  clear(): void {
    this.data.clear();
  }

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] ?? null;
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }
}

export const qualityForTests: QualityProfile = GameConfig.quality.medium;
