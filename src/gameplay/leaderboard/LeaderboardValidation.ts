/**
 * Defensive validation and sanitization for leaderboard score submissions.
 *
 * Enforces physics bounds, timing bounds, and input sanitization to safeguard
 * leaderboard integrity without requiring user authentication.
 */

import { GameConfig } from '../../app/GameConfig';
import type { ScoreSubmission, ValidationResult } from './LeaderboardTypes';

const SIGNATURE_SALT = 'santhai-veeramani-run-salt-2026';
const MAX_THEORETICAL_SPEED = 38; // Max speed (27) + boost speed bonus (5) + safety margin
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 15;
const DEFAULT_NAME = 'Runner';

/** Basic profanity / offensive tokens to sanitize. */
const BLOCKED_WORDS = ['admin', 'root', 'nigger', 'fucker', 'asshole', 'bitch', 'cunt'];

/**
 * Sanitize player nickname.
 * - Strips any HTML tags or script markup.
 * - Preserves alphanumeric characters, spaces, hyphens, underscores, and Tamil script (\u0B80-\u0BFF).
 * - Enforces length bounds (2 - 15 characters).
 */
export function sanitizePlayerName(rawName: unknown): string {
  if (typeof rawName !== 'string') return DEFAULT_NAME;

  // Strip HTML tags and control characters
  let clean = rawName
    .replace(/<[^>]*>/g, '')
    .replace(/[<>'"&\\/]/g, '')
    .trim();

  // Allow Latin alphanumeric, spaces, hyphens, underscores, and Tamil unicode characters
  clean = clean.replace(/[^\w\s\-\u0B80-\u0BFF]/g, '').trim();

  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, ' ');

  // Filter blocked words (case-insensitive)
  const lower = clean.toLowerCase();
  for (const blocked of BLOCKED_WORDS) {
    if (lower.includes(blocked)) {
      return DEFAULT_NAME;
    }
  }

  if (clean.length < MIN_NAME_LENGTH) {
    return clean.length > 0 ? `${clean}_runner` : DEFAULT_NAME;
  }

  if (clean.length > MAX_NAME_LENGTH) {
    clean = clean.slice(0, MAX_NAME_LENGTH).trim();
  }

  return clean || DEFAULT_NAME;
}

/**
 * Generate a deterministic checksum for score submission verification.
 */
export function generateRunSignature(submission: Omit<ScoreSubmission, 'signature'>): string {
  const payload = [
    submission.deviceId,
    Math.floor(submission.score),
    Math.floor(submission.distance),
    Math.floor(submission.tokens),
    Math.floor(submission.runTimeSeconds),
    SIGNATURE_SALT,
  ].join(':');

  // Simple, fast 32-bit FNV-1a hash formatted as hex string
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Verify whether a score submission is mathematically plausible.
 */
export function validateSubmission(submission: ScoreSubmission): ValidationResult {
  const { score, distance, tokens, runTimeSeconds } = submission;

  if (
    !Number.isFinite(score) ||
    !Number.isFinite(distance) ||
    !Number.isFinite(tokens) ||
    !Number.isFinite(runTimeSeconds)
  ) {
    return { valid: false, reason: 'Invalid numeric fields in score submission.' };
  }

  if (score < 0 || distance < 0 || tokens < 0 || runTimeSeconds < 0) {
    return { valid: false, reason: 'Negative score or distance is impossible.' };
  }

  // Speed plausibility: if time is recorded, distance/time cannot exceed theoretical speed cap
  if (runTimeSeconds > 2) {
    const avgSpeed = distance / runTimeSeconds;
    if (avgSpeed > MAX_THEORETICAL_SPEED) {
      return {
        valid: false,
        reason: `Average speed (${avgSpeed.toFixed(1)} m/s) exceeds maximum allowed limit.`,
      };
    }
  }

  // Score formula plausibility:
  // Base score = distance * pointsPerMeter + tokens * pointsPerToken
  // Max score with multiplier = base * maxMultiplier * 1.08 (8% rounding buffer)
  const maxMultiplier = GameConfig.scoring.maxMultiplier;
  const theoreticalBase =
    distance * GameConfig.scoring.pointsPerMeter + tokens * GameConfig.scoring.pointsPerToken;
  const theoreticalMax = Math.ceil(theoreticalBase * maxMultiplier * 1.08) + 10;

  if (score > theoreticalMax && score > 50) {
    return {
      valid: false,
      reason: `Score (${score}) exceeds theoretical maximum (${theoreticalMax}) for distance and tokens.`,
    };
  }

  const sanitizedName = sanitizePlayerName(submission.name);

  return {
    valid: true,
    sanitizedName,
  };
}
