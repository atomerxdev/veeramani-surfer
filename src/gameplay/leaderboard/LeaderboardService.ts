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
 * Built-in Tamil Nadu street market community high scores.
 * Gives immediate vitality and fun competitive benchmarks on first launch.
 */
export const DEFAULT_COMMUNITY_SCORES: readonly Omit<LeaderboardEntry, 'rank'>[] = [
  { id: 'comm-1', name: 'வீரமணி (Veera)', score: 18450, distance: 1240, tokens: 185, timestamp: 1715000000000 },
  { id: 'comm-2', name: 'Delivery_Boy_1', score: 15200, distance: 1080, tokens: 142, timestamp: 1715050000000 },
  { id: 'comm-3', name: 'Chennai_Express', score: 13950, distance: 990, tokens: 135, timestamp: 1715100000000 },
  { id: 'comm-4', name: 'Delivery_Boy_2', score: 12100, distance: 880, tokens: 110, timestamp: 1715150000000 },
  { id: 'comm-5', name: 'Madurai_Veeran', score: 9800, distance: 740, tokens: 92, timestamp: 1715200000000 },
  { id: 'comm-6', name: 'Kovai_Rider', score: 8150, distance: 620, tokens: 78, timestamp: 1715250000000 },
  { id: 'comm-7', name: 'Santhai_Surfer', score: 6900, distance: 530, tokens: 64, timestamp: 1715300000000 },
  { id: 'comm-8', name: 'Tanjore_King', score: 5400, distance: 410, tokens: 52, timestamp: 1715350000000 },
  { id: 'comm-9', name: 'Auto_Annan', score: 4200, distance: 340, tokens: 38, timestamp: 1715400000000 },
  { id: 'comm-10', name: 'Tea_Kada_Boy', score: 3100, distance: 260, tokens: 25, timestamp: 1715450000000 },
];

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
            list = parsed as LeaderboardEntry[];
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
