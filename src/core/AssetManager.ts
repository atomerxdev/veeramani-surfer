/**
 * Asset manager.
 *
 * The current build is fully procedural (no external GLB/texture/audio files are
 * required), so this manager exists to make the optional art pipeline safe: every
 * load is awaited with a timeout and a failure returns `null` instead of throwing,
 * which lets the caller fall back to placeholder geometry. Nothing here can stop
 * the game from starting.
 */

import type { Object3D } from 'three';

export interface AssetEntry<T> {
  readonly key: string;
  readonly loader: () => Promise<T>;
  readonly timeoutMs?: number;
}

export interface AssetLoadReport {
  readonly loaded: string[];
  readonly failed: string[];
}

export class AssetManager {
  private readonly cache = new Map<string, unknown>();
  private readonly failures = new Set<string>();

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get<T>(key: string): T | null {
    const value = this.cache.get(key);
    return value === undefined ? null : (value as T);
  }

  /**
   * Load a batch of assets. Never rejects: a broken or missing file is recorded
   * in the report and the game continues with placeholders.
   */
  async loadAll(entries: readonly AssetEntry<unknown>[]): Promise<AssetLoadReport> {
    const loaded: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        try {
          const value = await withTimeout(entry.loader(), entry.timeoutMs ?? 15000);
          this.cache.set(entry.key, value);
          loaded.push(entry.key);
        } catch {
          this.failures.add(entry.key);
          failed.push(entry.key);
        }
      }),
    );

    return { loaded, failed };
  }

  /** Convenience for optionally loaded 3D props/scenes. */
  getObject(key: string): Object3D | null {
    return this.get<Object3D>(key);
  }

  dispose(): void {
    this.cache.clear();
    this.failures.clear();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('asset load timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
