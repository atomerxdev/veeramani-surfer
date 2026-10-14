/**
 * Leaderboard coordinator service.
 *
 * Unifies local arcade scores and global leaderboard ranking with anonymous
 * device identification, automatic username generation, and online API syncing.
 */

import { safeLocalStorage, type StorageLike } from '../../core/StorageManager';
import type {
  LeaderboardEntry,
  LeaderboardSummary,
  LeaderboardTab,
  ScoreSubmission,
} from './LeaderboardTypes';
import {
  generateRunSignature,
  sanitizePlayerName,
  validateSubmission,
} from './LeaderboardValidation';
import { LocalLeaderboardService } from './LocalLeaderboardService';

export const DEVICE_ID_KEY = 'santhai-sprint.device.id';
export const PLAYER_NAME_KEY = 'santhai-sprint.player.name';
export const GLOBAL_CACHE_KEY = 'santhai-sprint.leaderboard.global.cache.v1';

const NAME_PREFIXES = ['Veera', 'Kovai', 'Singam', 'Anbu', 'Velan', 'Kaalai', 'Tamil', 'Racer'];
const NAME_SUFFIXES = ['Speed', 'Dash', 'Bolt', 'Pro', 'Jet', 'Hero', 'King', 'Star'];

/**
 * Generate a random Tamil Nadu street runner nickname (<= 15 characters).
 * e.g. "Veera_Speed_42", "Singam_Dash_18", "Kovai_Bolt_88"
 */
export function generateRandomRunnerName(): string {
  const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
  const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  const num = Math.floor(10 + Math.random() * 90);
  const name = `${prefix}_${suffix}_${num}`;
  return name.slice(0, 15);
}

/**
 * Built-in community high scores (empty by default; populated by real runs).
 */
export const DEFAULT_COMMUNITY_SCORES: readonly Omit<LeaderboardEntry, 'rank'>[] = [];

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class LeaderboardService {
  readonly deviceId: string;
  readonly local: LocalLeaderboardService;
  private playerName: string;
  private globalEntries: LeaderboardEntry[] = [];
  private readonly apiUrl?: string;

  constructor(
    private readonly storage: StorageLike | null = safeLocalStorage(),
    options: { apiUrl?: string } = {},
  ) {
    this.local = new LocalLeaderboardService(storage);
    this.deviceId = this.initDeviceId();
    this.playerName = this.initPlayerName();
    this.apiUrl = options.apiUrl ?? '/api/leaderboard';
    this.globalEntries = this.readGlobalCache();
  }

  private initDeviceId(): string {
    if (!this.storage) return generateUuid();
    try {
      let id = this.storage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = generateUuid();
        this.storage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return generateUuid();
    }
  }

  private initPlayerName(): string {
    if (!this.storage) return generateRandomRunnerName();
    try {
      const saved = this.storage.getItem(PLAYER_NAME_KEY);
      if (saved) return sanitizePlayerName(saved);
      const generated = generateRandomRunnerName();
      this.storage.setItem(PLAYER_NAME_KEY, generated);
      return generated;
    } catch {
      return generateRandomRunnerName();
    }
  }

  getPlayerName(): string {
    return this.playerName;
  }

  setPlayerName(name: string): string {
    const sanitized = sanitizePlayerName(name);
    this.playerName = sanitized;
    if (this.storage) {
      try {
        this.storage.setItem(PLAYER_NAME_KEY, sanitized);
      } catch {
        /* ignore */
      }
    }
    return sanitized;
  }

  rollRandomPlayerName(): string {
    const newName = generateRandomRunnerName();
    return this.setPlayerName(newName);
  }

  /**
   * Fetch online scores from the cloud API with cache fallback.
   */
  async fetchOnlineScores(): Promise<LeaderboardEntry[]> {
    if (!this.apiUrl || typeof fetch === 'undefined') return this.globalEntries;
    try {
      const res = await fetch(this.apiUrl, { method: 'GET' });
      if (res.ok) {
        const data = (await res.json()) as { entries?: LeaderboardEntry[] };
        if (Array.isArray(data.entries) && data.entries.length > 0) {
          this.globalEntries = data.entries;
          this.commitGlobalCache();
        }
      }
    } catch {
      // Offline fallback: keep cached entries
    }
    return this.globalEntries;
  }

  /**
   * Submit a run score to local arcade storage and the global leaderboard.
   */
  async submitScore(submission: Omit<ScoreSubmission, 'deviceId' | 'signature'>): Promise<{
    success: boolean;
    reason?: string;
    localRank?: number;
    globalRank?: number;
  }> {
    const fullSubmission: ScoreSubmission = {
      ...submission,
      deviceId: this.deviceId,
      name: this.playerName,
      signature: generateRunSignature({
        ...submission,
        deviceId: this.deviceId,
        name: this.playerName,
      }),
    };

    const validation = validateSubmission(fullSubmission);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const sanitizedName = validation.sanitizedName ?? this.playerName;
    this.setPlayerName(sanitizedName);

    // 1. Add to local arcade leaderboard
    const localEntry = this.local.addEntry({
      name: sanitizedName,
      score: fullSubmission.score,
      distance: fullSubmission.distance,
      tokens: fullSubmission.tokens,
      timestamp: Date.now(),
    });

    // 2. Upsert into global leaderboard (1 record per deviceId)
    const existingIndex = this.globalEntries.findIndex((e) => e.id === this.deviceId);
    const playerEntry: LeaderboardEntry = {
      id: this.deviceId,
      name: sanitizedName,
      score: fullSubmission.score,
      distance: fullSubmission.distance,
      tokens: fullSubmission.tokens,
      timestamp: Date.now(),
      isCurrentPlayer: true,
    };

    if (existingIndex >= 0) {
      if (playerEntry.score > this.globalEntries[existingIndex].score) {
        this.globalEntries[existingIndex] = playerEntry;
      }
    } else {
      this.globalEntries.push(playerEntry);
    }

    this.globalEntries.sort((a, b) => b.score - a.score);
    this.commitGlobalCache();

    let globalRank = this.globalEntries.findIndex((e) => e.id === this.deviceId) + 1;

    // 3. Dispatch to remote API if configured
    if (this.apiUrl && typeof fetch !== 'undefined') {
      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullSubmission),
        });
        if (response.ok) {
          const resJson = (await response.json()) as { entries?: LeaderboardEntry[]; rank?: number };
          if (Array.isArray(resJson.entries)) {
            this.globalEntries = resJson.entries;
            this.commitGlobalCache();
          }
          if (typeof resJson.rank === 'number') {
            globalRank = resJson.rank;
          }
        }
      } catch {
        // Remote sync is best-effort and never disrupts the player experience
      }
    }

    return {
      success: true,
      localRank: localEntry.rank,
      globalRank: globalRank > 0 ? globalRank : undefined,
    };
  }

  /**
   * Get scores for the specified tab ('global' or 'local').
   */
  async getLeaderboard(tab: LeaderboardTab): Promise<LeaderboardSummary> {
    if (tab === 'local') {
      const entries = this.local.getEntries();
      return {
        entries,
        playerBest: entries[0] ?? null,
        playerRank: entries.length > 0 ? 1 : null,
      };
    }

    // Attempt to pull latest online scores
    await this.fetchOnlineScores();

    // Global tab
    const ranked = this.globalEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      isCurrentPlayer: entry.id === this.deviceId,
    }));

    const playerIndex = ranked.findIndex((e) => e.isCurrentPlayer);
    const playerBest = playerIndex >= 0 ? ranked[playerIndex] : null;
    const playerRank = playerIndex >= 0 ? playerIndex + 1 : null;

    return {
      entries: ranked.slice(0, 20),
      playerBest,
      playerRank,
    };
  }

  private readGlobalCache(): LeaderboardEntry[] {
    let list: LeaderboardEntry[] = [];
    if (this.storage) {
      try {
        const raw = this.storage.getItem(GLOBAL_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = (parsed as LeaderboardEntry[]).filter((e) => !e.id.startsWith('comm-'));
          }
        }
      } catch {
        /* fallback to defaults */
      }
    }

    if (list.length === 0) {
      list = DEFAULT_COMMUNITY_SCORES.map((e) => ({ ...e }));
    }

    list.sort((a, b) => b.score - a.score);
    return list;
  }

  private commitGlobalCache(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(GLOBAL_CACHE_KEY, JSON.stringify(this.globalEntries));
    } catch {
      /* ignore */
    }
  }
}
