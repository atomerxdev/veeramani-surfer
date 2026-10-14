import { describe, expect, it } from 'vitest';
import { LocalLeaderboardService, MAX_LOCAL_ENTRIES } from '../../src/gameplay/leaderboard/LocalLeaderboardService';
import type { StorageLike } from '../../src/core/StorageManager';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('LocalLeaderboardService', () => {
  it('starts empty when storage is clear', () => {
    const storage = new MemoryStorage();
    const service = new LocalLeaderboardService(storage);
    expect(service.getEntries()).toHaveLength(0);
  });

  it('adds entries and sorts descending by score with 1-based ranks', () => {
    const storage = new MemoryStorage();
    const service = new LocalLeaderboardService(storage);

    service.addEntry({
      name: 'Player 1',
      score: 500,
      distance: 300,
      tokens: 20,
      timestamp: 1000,
    });

    service.addEntry({
      name: 'Player 2',
      score: 1200,
      distance: 700,
      tokens: 50,
      timestamp: 2000,
    });

    const entries = service.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('Player 2');
    expect(entries[0].score).toBe(1200);
    expect(entries[0].rank).toBe(1);

    expect(entries[1].name).toBe('Player 1');
    expect(entries[1].score).toBe(500);
    expect(entries[1].rank).toBe(2);
  });

  it('caps at MAX_LOCAL_ENTRIES (10)', () => {
    const storage = new MemoryStorage();
    const service = new LocalLeaderboardService(storage);

    for (let i = 1; i <= 15; i++) {
      service.addEntry({
        name: `Runner ${i}`,
        score: i * 100,
        distance: i * 50,
        tokens: i * 5,
        timestamp: Date.now(),
      });
    }

    const entries = service.getEntries();
    expect(entries).toHaveLength(MAX_LOCAL_ENTRIES);
    expect(entries[0].score).toBe(1500);
    expect(entries[entries.length - 1].score).toBe(600);
  });

  it('calculates expected rank for a given score', () => {
    const storage = new MemoryStorage();
    const service = new LocalLeaderboardService(storage);

    service.addEntry({ name: 'A', score: 3000, distance: 100, tokens: 10, timestamp: 1 });
    service.addEntry({ name: 'B', score: 2000, distance: 100, tokens: 10, timestamp: 2 });
    service.addEntry({ name: 'C', score: 1000, distance: 100, tokens: 10, timestamp: 3 });

    expect(service.getRankForScore(4000)).toBe(1);
    expect(service.getRankForScore(2500)).toBe(2);
    expect(service.getRankForScore(1500)).toBe(3);
    expect(service.getRankForScore(500)).toBe(4);
    expect(service.getRankForScore(0)).toBeNull();
  });

  it('recovers gracefully from corrupted storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('santhai-sprint.leaderboard.local.v1', '{ not valid JSON array');

    const service = new LocalLeaderboardService(storage);
    expect(service.getEntries()).toHaveLength(0);
  });

  it('clears all entries', () => {
    const storage = new MemoryStorage();
    const service = new LocalLeaderboardService(storage);

    service.addEntry({ name: 'A', score: 1000, distance: 100, tokens: 10, timestamp: 1 });
    expect(service.getEntries()).toHaveLength(1);

    service.clear();
    expect(service.getEntries()).toHaveLength(0);
  });
});
