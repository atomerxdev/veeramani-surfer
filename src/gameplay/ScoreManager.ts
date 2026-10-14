/**
 * Scoring.
 *
 * Score = distance points + token points, both multiplied by whatever multiplier
 * is active when they are earned. The pure helpers below are shared with the unit
 * tests so the documented formula and the runtime behaviour cannot drift apart.
 */

import { GameConfig, type GameConfigShape } from '../app/GameConfig';
import type { StorageManager } from '../core/StorageManager';

export interface RunResult {
  readonly score: number;
  readonly distance: number;
  readonly tokens: number;
  readonly best: number;
  readonly newBest: boolean;
}

/** Points for a lump of distance and tokens at a fixed multiplier. */
export function computeScore(
  distance: number,
  tokens: number,
  multiplier = 1,
  config: GameConfigShape = GameConfig,
): number {
  const base =
    Math.max(0, distance) * config.scoring.pointsPerMeter +
    Math.max(0, tokens) * config.scoring.pointsPerToken;
  return Math.floor(base * Math.max(1, multiplier));
}

/** Points earned by travelling `metres` at `multiplier` (not floored). */
export function distancePoints(
  metres: number,
  multiplier: number,
  config: GameConfigShape = GameConfig,
): number {
  return Math.max(0, metres) * config.scoring.pointsPerMeter * Math.max(1, multiplier);
}

/** Points earned by collecting `count` tokens at `multiplier`. */
export function tokenPoints(
  count: number,
  multiplier: number,
  config: GameConfigShape = GameConfig,
): number {
  return Math.max(0, count) * config.scoring.pointsPerToken * Math.max(1, multiplier);
}

export class ScoreManager {
  private scoreValue = 0;
  private distanceValue = 0;
  private tokensValue = 0;
  private bestValue: number;

  constructor(
    private readonly storage: StorageManager,
    private readonly config: GameConfigShape = GameConfig,
  ) {
    this.bestValue = storage.get().bestScore;
  }

  get score(): number {
    return Math.floor(this.scoreValue);
  }

  /** Live score including the fraction of a metre just travelled. */
  get rawScore(): number {
    return this.scoreValue;
  }

  get distance(): number {
    return Math.floor(this.distanceValue);
  }

  get rawDistance(): number {
    return this.distanceValue;
  }

  get tokens(): number {
    return this.tokensValue;
  }

  get best(): number {
    return this.bestValue;
  }

  reset(): void {
    this.scoreValue = 0;
    this.distanceValue = 0;
    this.tokensValue = 0;
  }

  /** Distance is earned continuously, at the live multiplier. */
  addDistance(metres: number, multiplier = 1): void {
    if (metres <= 0) return;
    this.distanceValue += metres;
    this.scoreValue += distancePoints(metres, multiplier, this.config);
  }

  addTokens(count: number, multiplier = 1): void {
    if (count <= 0) return;
    this.tokensValue += count;
    this.scoreValue += tokenPoints(count, multiplier, this.config);
  }

  /** Persist the finished run and report whether the score was a record. */
  finish(): RunResult {
    const score = this.score;
    const { newBest, profile } = this.storage.recordRun({
      score,
      distance: this.distance,
      tokens: this.tokensValue,
    });
    this.bestValue = profile.bestScore;
    return {
      score,
      distance: this.distance,
      tokens: this.tokensValue,
      best: this.bestValue,
      newBest,
    };
  }
}
