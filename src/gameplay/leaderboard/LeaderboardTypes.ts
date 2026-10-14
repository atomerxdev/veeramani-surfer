/**
 * Types and interfaces for the leaderboard system.
 */

export interface LeaderboardEntry {
  /** Unique identifier (deviceId for global, local UUID for local entries). */
  readonly id: string;
  /** Player display name (e.g. "Veeramani", "SuperSpeed"). */
  readonly name: string;
  /** Final score achieved. */
  readonly score: number;
  /** Distance covered in meters. */
  readonly distance: number;
  /** Tokens collected during the run. */
  readonly tokens: number;
  /** Epoch timestamp (ms) when the score was recorded. */
  readonly timestamp: number;
  /** Optional rank position (1-indexed). */
  readonly rank?: number;
  /** Whether this entry belongs to the current device/player. */
  readonly isCurrentPlayer?: boolean;
}

export interface ScoreSubmission {
  readonly deviceId: string;
  readonly name: string;
  readonly score: number;
  readonly distance: number;
  readonly tokens: number;
  readonly runTimeSeconds: number;
  readonly signature?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly sanitizedName?: string;
}

export type LeaderboardTab = 'global' | 'local';

export interface LeaderboardSummary {
  readonly entries: readonly LeaderboardEntry[];
  readonly playerBest?: LeaderboardEntry | null;
  readonly playerRank?: number | null;
}
