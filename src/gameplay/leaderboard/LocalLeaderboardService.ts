/**
 * Local arcade leaderboard service.
 *
 * Persists the player's top 10 runs on this device using LocalStorage.
 * Defensive against corrupted payloads, keeps entries sorted by score,
 * and handles rank calculation.
 */

import { safeLocalStorage, type StorageLike } from '../../core/StorageManager';
import type { LeaderboardEntry } from './LeaderboardTypes';

export const LOCAL_LEADERBOARD_KEY = 'santhai-sprint.leaderboard.local.v1';
export const MAX_LOCAL_ENTRIES = 10;

function generateLocalId(): string {
  return `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export class LocalLeaderboardService {
  private entries: LeaderboardEntry[] = [];

  constructor(
    private readonly storage: StorageLike | null = safeLocalStorage(),
    private readonly key: string = LOCAL_LEADERBOARD_KEY,
  ) {
    this.entries = this.read();
  }

  private read(): LeaderboardEntry[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];

      const sanitized: LeaderboardEntry[] = [];
      for (const item of parsed) {
        if (typeof item === 'object' && item !== null) {
          const rec = item as Record<string, unknown>;
          const score = typeof rec['score'] === 'number' && Number.isFinite(rec['score']) ? rec['score'] : 0;
          const distance = typeof rec['distance'] === 'number' && Number.isFinite(rec['distance']) ? rec['distance'] : 0;
          const tokens = typeof rec['tokens'] === 'number' && Number.isFinite(rec['tokens']) ? rec['tokens'] : 0;
          const timestamp = typeof rec['timestamp'] === 'number' ? rec['timestamp'] : Date.now();
          const name = typeof rec['name'] === 'string' && rec['name'].trim() ? rec['name'].trim() : 'Runner';
          const id = typeof rec['id'] === 'string' ? rec['id'] : generateLocalId();

          sanitized.push({
            id,
            name,
            score: Math.max(0, Math.floor(score)),
            distance: Math.max(0, Math.floor(distance)),
            tokens: Math.max(0, Math.floor(tokens)),
            timestamp,
          });
        }
      }

      sanitized.sort((a, b) => b.score - a.score);
      return sanitized.slice(0, MAX_LOCAL_ENTRIES);
    } catch {
      return [];
    }
  }

  getEntries(): readonly LeaderboardEntry[] {
    return this.entries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  /**
   * Determine what rank a given score would take in the local leaderboard.
   * Returns null if score does not make the top 10.
   */
  getRankForScore(score: number): number | null {
    if (score <= 0) return null;
    let rank = 1;
    for (const entry of this.entries) {
      if (score > entry.score) {
        return rank;
      }
      rank++;
    }
    if (this.entries.length < MAX_LOCAL_ENTRIES) {
      return this.entries.length + 1;
    }
    return null;
  }

  addEntry(entry: Omit<LeaderboardEntry, 'id' | 'rank'>): LeaderboardEntry {
    const newEntry: LeaderboardEntry = {
      ...entry,
      id: generateLocalId(),
      score: Math.max(0, Math.floor(entry.score)),
      distance: Math.max(0, Math.floor(entry.distance)),
      tokens: Math.max(0, Math.floor(entry.tokens)),
      timestamp: entry.timestamp || Date.now(),
    };

    const next = [...this.entries, newEntry];
    next.sort((a, b) => b.score - a.score);
    this.entries = next.slice(0, MAX_LOCAL_ENTRIES);
    this.commit();

    const rank = this.entries.findIndex((e) => e.id === newEntry.id) + 1;
    return {
      ...newEntry,
      rank: rank > 0 ? rank : undefined,
    };
  }

  clear(): void {
    this.entries = [];
    if (this.storage) {
      try {
        this.storage.removeItem(this.key);
      } catch {
        /* ignore */
      }
    }
  }

  private commit(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.entries));
    } catch {
      /* ignore storage quotas */
    }
  }
}
