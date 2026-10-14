/**
 * Three-lane lateral movement.
 *
 * Owns the lane index and the smoothed lateral position. Lane changes use
 * frame-rate independent exponential smoothing so the character glides across the
 * road, while the gameplay lane index snaps immediately on input. Collision uses
 * the *actual* interpolated X (see PlayerController), so a half-finished lane
 * change is never a free pass through an obstacle.
 */

import { GameConfig, laneToX, clampLane, type GameConfigShape } from '../app/GameConfig';

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  if (dt <= 0) return current;
  const t = 1 - Math.exp(-lambda * dt);
  const next = current + (target - current) * t;
  // Snap when close enough so the value actually converges.
  return Math.abs(target - next) < 1e-4 ? target : next;
}

export class LaneSystem {
  private laneIndex: number;
  private currentX: number;
  private previousX: number;

  constructor(
    private readonly config: GameConfigShape = GameConfig,
    startLane = Math.floor(GameConfig.world.laneCount / 2),
  ) {
    this.laneIndex = clampLane(startLane, config);
    this.currentX = laneToX(this.laneIndex, config);
    this.previousX = this.currentX;
  }

  /** Current gameplay lane (0 = leftmost). */
  get lane(): number {
    return this.laneIndex;
  }

  get laneCount(): number {
    return this.config.world.laneCount;
  }

  /** Smoothed lateral world position. */
  get x(): number {
    return this.currentX;
  }

  /** Lateral speed in units/second, used for lean and camera damping. */
  get lateralVelocity(): number {
    return this.currentX - this.previousX;
  }

  /** How far the character is from the centre of its lane (0 = centred). */
  get offsetFromLane(): number {
    return this.currentX - laneToX(this.laneIndex, this.config);
  }

  get isSettled(): boolean {
    return this.currentX === laneToX(this.laneIndex, this.config);
  }

  /**
   * Move by `delta` lanes. Returns true when the lane actually changed, which
   * lets the caller play feedback only for real movement (no sound at the walls).
   */
  move(delta: number): boolean {
    return this.setLane(this.laneIndex + delta);
  }

  setLane(lane: number): boolean {
    const next = clampLane(lane, this.config);
    if (next === this.laneIndex) return false;
    this.laneIndex = next;
    return true;
  }

  /** Advance the smoothed position. */
  update(dt: number): void {
    this.previousX = this.currentX;
    this.currentX = damp(
      this.currentX,
      laneToX(this.laneIndex, this.config),
      this.config.player.laneChangeLambda,
      dt,
    );
  }

  /** Teleport to a lane without animation (restart, respawn). */
  reset(lane = Math.floor(this.config.world.laneCount / 2)): void {
    this.laneIndex = clampLane(lane, this.config);
    this.currentX = laneToX(this.laneIndex, this.config);
    this.previousX = this.currentX;
  }
}
