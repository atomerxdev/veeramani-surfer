import { describe, expect, it } from 'vitest';
import {
  LeaderboardService,
  DEVICE_ID_KEY,
  PLAYER_NAME_KEY,
  generateRandomRunnerName,
} from '../../src/gameplay/leaderboard/LeaderboardService';
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

describe('LeaderboardService', () => {
  it('generates random runner names within 15 character limit', () => {
    for (let i = 0; i < 20; i++) {
      const name = generateRandomRunnerName();
      expect(name.length).toBeLessThanOrEqual(15);
      expect(name.length).toBeGreaterThanOrEqual(5);
      expect(name).toMatch(/^[A-Za-z]+_[A-Za-z]+_\d{2}$/);
    }
  });

  it('automatically assigns and persists a random runner name when none exists', () => {
    const storage = new MemoryStorage();
    const service = new LeaderboardService(storage, { apiUrl: '' });

    expect(service.deviceId).toBeDefined();
    expect(service.deviceId.length).toBeGreaterThan(5);
    expect(storage.getItem(DEVICE_ID_KEY)).toBe(service.deviceId);

    const assignedName = service.getPlayerName();
    expect(assignedName).toBeDefined();
    expect(assignedName.length).toBeLessThanOrEqual(15);
    expect(storage.getItem(PLAYER_NAME_KEY)).toBe(assignedName);
  });

  it('rolls a new random player name and updates storage', () => {
    const storage = new MemoryStorage();
    const service = new LeaderboardService(storage, { apiUrl: '' });

    const original = service.getPlayerName();
    const rolled = service.rollRandomPlayerName();

    expect(rolled).toBeDefined();
    expect(storage.getItem(PLAYER_NAME_KEY)).toBe(rolled);
    expect(typeof original).toBe('string');
  });

  it('persists updated custom player name across sessions', () => {
    const storage = new MemoryStorage();
    const service1 = new LeaderboardService(storage, { apiUrl: '' });

    service1.setPlayerName('Karthik_Run');
    expect(storage.getItem(PLAYER_NAME_KEY)).toBe('Karthik_Run');

    const service2 = new LeaderboardService(storage, { apiUrl: '' });
    expect(service2.getPlayerName()).toBe('Karthik_Run');
    expect(service2.deviceId).toBe(service1.deviceId);
  });

  it('starts with an empty global leaderboard when no runs have been submitted', async () => {
    const storage = new MemoryStorage();
    const service = new LeaderboardService(storage, { apiUrl: '' });

    const global = await service.getLeaderboard('global');
    expect(global.entries).toHaveLength(0);
    expect(global.playerBest).toBeNull();
    expect(global.playerRank).toBeNull();
  });

  it('submits score and updates both local and global views', async () => {
    const storage = new MemoryStorage();
    const service = new LeaderboardService(storage, { apiUrl: '' });

    service.setPlayerName('Champion');
    const result = await service.submitScore({
      name: 'Champion',
      score: 9500,
      distance: 1100,
      tokens: 150,
      runTimeSeconds: 65,
    });

    expect(result.success).toBe(true);
    expect(result.localRank).toBe(1);

    // Check local tab
    const local = await service.getLeaderboard('local');
    expect(local.entries).toHaveLength(1);
    expect(local.entries[0].name).toBe('Champion');
    expect(local.entries[0].score).toBe(9500);

    // Check global tab
    const global = await service.getLeaderboard('global');
    expect(global.entries).toHaveLength(1);
    expect(global.playerBest).not.toBeNull();
    expect(global.playerBest?.score).toBe(9500);
    expect(global.playerBest?.isCurrentPlayer).toBe(true);
    expect(global.playerRank).toBe(1);
  });

  it('rejects invalid submission without saving', async () => {
    const storage = new MemoryStorage();
    const service = new LeaderboardService(storage, { apiUrl: '' });

    const result = await service.submitScore({
      name: 'Hacker',
      score: 9999999, // Impossible score
      distance: 10,
      tokens: 0,
      runTimeSeconds: 1,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();

    const local = await service.getLeaderboard('local');
    expect(local.entries).toHaveLength(0);
  });
});
